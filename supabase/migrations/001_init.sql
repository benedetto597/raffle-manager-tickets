-- Rifa Solidaria: esquema + RPCs.
-- Las tablas tienen RLS sin políticas: la anon key solo puede ejecutar las funciones permitidas abajo.
-- El PIN NO se versiona. Defínelo una vez con:
--   update public.admin_cfg set pin_hash = extensions.crypt('<PIN 6 dígitos>', extensions.gen_salt('bf', 10)) where id = 1;

create extension if not exists pgcrypto with schema extensions;

create table public.tickets (
  n            smallint primary key check (n between 1 and 200),
  status       text not null default 'disponible'
               check (status in ('disponible', 'por_verificar', 'vendido')),
  nombre       text check (char_length(nombre) between 2 and 80),
  telefono     text check (telefono ~ '^[0-9]{8,15}$'),
  hold_token   uuid,
  held_until   timestamptz,
  reservado_at timestamptz,
  vendido_at   timestamptz
);
insert into public.tickets (n) select generate_series(1, 200);
create index tickets_hold_token_idx on public.tickets (hold_token) where hold_token is not null;

create table public.admin_cfg (
  id           int primary key check (id = 1),
  pin_hash     text,
  fails        int not null default 0,
  locked_until timestamptz
);
insert into public.admin_cfg (id) values (1);

create table public.draws (
  id       bigint generated always as identity primary key,
  n        smallint not null references public.tickets (n),
  nombre   text not null,
  telefono text not null,
  drawn_at timestamptz not null default now()
);

alter table public.tickets   enable row level security;
alter table public.admin_cfg enable row level security;
alter table public.draws     enable row level security;
revoke all on public.tickets, public.admin_cfg, public.draws from anon, authenticated;

-- ---------- Público ----------

create function public.available_numbers()
returns smallint[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(n order by n), '{}')
  from tickets
  where status = 'disponible' and (held_until is null or held_until < now());
$$;

create function public.hold_ticket()
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_n smallint; v_tok uuid := gen_random_uuid(); v_until timestamptz := now() + interval '10 minutes';
begin
  -- Freno anti-acaparamiento: máximo 40 apartados activos a la vez.
  if (select count(*) from tickets where status = 'disponible' and held_until > now()) >= 40 then
    raise exception 'OCUPADO' using errcode = 'P0001';
  end if;
  select n into v_n from tickets
   where status = 'disponible' and (held_until is null or held_until < now())
   order by random() limit 1
   for update skip locked;
  if v_n is null then raise exception 'AGOTADO' using errcode = 'P0001'; end if;
  update tickets set hold_token = v_tok, held_until = v_until where n = v_n;
  return json_build_object('n', v_n, 'token', v_tok, 'expires', v_until);
end $$;

create function public.confirm_ticket(p_token uuid, p_nombre text, p_tel text)
returns smallint language plpgsql security definer set search_path = public as $$
declare v_n smallint; v_nom text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
        v_tel text := regexp_replace(coalesce(p_tel, ''), '[^0-9]', '', 'g');
begin
  if char_length(v_nom) not between 2 and 80 then raise exception 'NOMBRE' using errcode = 'P0001'; end if;
  if v_tel !~ '^[0-9]{8,15}$' then raise exception 'TELEFONO' using errcode = 'P0001'; end if;
  update tickets
     set status = 'por_verificar', nombre = v_nom, telefono = v_tel, reservado_at = now(),
         hold_token = null, held_until = null
   where hold_token = p_token and held_until > now() and status = 'disponible'
  returning n into v_n;
  if v_n is null then raise exception 'EXPIRADO' using errcode = 'P0001'; end if;
  return v_n;
end $$;

-- ---------- Admin ----------

-- Devuelve 'ok' | 'pin' | 'locked'. No lanza excepción para que el contador de fallos persista.
create function public._auth(p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare c admin_cfg;
begin
  select * into c from admin_cfg where id = 1 for update;
  if c.locked_until > now() then return 'locked'; end if;
  if c.pin_hash is not null and coalesce(p_pin, '') ~ '^[0-9]{6}$' and crypt(p_pin, c.pin_hash) = c.pin_hash then
    update admin_cfg set fails = 0, locked_until = null where id = 1;
    return 'ok';
  end if;
  update admin_cfg
     set fails = case when fails + 1 >= 5 then 0 else fails + 1 end,
         locked_until = case when fails + 1 >= 5 then now() + interval '10 minutes' else locked_until end
   where id = 1;
  return 'pin';
end $$;

create function public.admin_list(p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare a text := _auth(p_pin);
begin
  if a <> 'ok' then return json_build_object('error', a); end if;
  return json_build_object(
    'tickets', (select json_agg(json_build_object(
        'n', n, 'status', status, 'nombre', nombre, 'telefono', telefono,
        'reservado_at', reservado_at, 'vendido_at', vendido_at) order by n) from tickets),
    'draw', (select row_to_json(d) from (select n, nombre, telefono, drawn_at from draws order by id desc limit 1) d));
end $$;

create function public.admin_set_status(p_pin text, p_n smallint, p_status text)
returns json language plpgsql security definer set search_path = public as $$
declare a text := _auth(p_pin); v_cur text;
begin
  if a <> 'ok' then return json_build_object('error', a); end if;
  select status into v_cur from tickets where n = p_n for update;
  if v_cur is null then return json_build_object('error', 'boleto'); end if;
  if p_status = 'vendido' and v_cur = 'por_verificar' then
    update tickets set status = 'vendido', vendido_at = now() where n = p_n;
  elsif p_status = 'por_verificar' and v_cur = 'vendido' then
    update tickets set status = 'por_verificar', vendido_at = null where n = p_n;
  elsif p_status = 'disponible' and v_cur <> 'disponible' then
    if exists (select 1 from draws where n = p_n) then return json_build_object('error', 'ganador'); end if;
    update tickets set status = 'disponible', nombre = null, telefono = null,
           reservado_at = null, vendido_at = null, hold_token = null, held_until = null where n = p_n;
  else
    return json_build_object('error', 'transicion');
  end if;
  return json_build_object('ok', true);
end $$;

create function public.admin_draw(p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare a text := _auth(p_pin); t tickets; d draws;
begin
  if a <> 'ok' then return json_build_object('error', a); end if;
  select * into t from tickets where status = 'vendido' order by random() limit 1;
  if t.n is null then return json_build_object('error', 'sin_vendidos'); end if;
  insert into draws (n, nombre, telefono) values (t.n, t.nombre, t.telefono) returning * into d;
  return json_build_object('n', d.n, 'nombre', d.nombre, 'telefono', d.telefono, 'drawn_at', d.drawn_at,
    'pool', (select json_agg(n order by n) from tickets where status = 'vendido'));
end $$;

create function public.admin_change_pin(p_pin text, p_new text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare a text := _auth(p_pin);
begin
  if a <> 'ok' then return json_build_object('error', a); end if;
  if coalesce(p_new, '') !~ '^[0-9]{6}$' then return json_build_object('error', 'formato'); end if;
  update admin_cfg set pin_hash = crypt(p_new, gen_salt('bf', 10)) where id = 1;
  return json_build_object('ok', true);
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.available_numbers(), public.hold_ticket(), public.confirm_ticket(uuid, text, text),
  public.admin_list(text), public.admin_set_status(text, smallint, text),
  public.admin_draw(text), public.admin_change_pin(text, text)
to anon;
