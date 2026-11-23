-- Cuenta de origen del pago: obligatoria para dar un boleto por vendido.
alter table public.tickets
  add column cuenta_pago text check (cuenta_pago ~ '^[[:alnum:] .#/-]{4,40}$');

create function public._cuenta(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), '');
$$;
revoke execute on function public._cuenta(text) from public, anon, authenticated;

-- admin_list: incluye la cuenta de pago.
create or replace function public.admin_list(p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare a text := _auth(p_pin);
begin
  if a <> 'ok' then return json_build_object('error', a); end if;
  return json_build_object(
    'tickets', (select json_agg(json_build_object(
        'n', n, 'status', status, 'nombre', nombre, 'telefono', telefono, 'cuenta_pago', cuenta_pago,
        'reservado_at', reservado_at, 'vendido_at', vendido_at) order by n) from tickets),
    'draw', (select row_to_json(d) from (select n, nombre, telefono, drawn_at from draws order by id desc limit 1) d));
end $$;

-- admin_set_status: pasar a 'vendido' exige p_cuenta.
drop function public.admin_set_status(text, smallint, text);
create function public.admin_set_status(p_pin text, p_n smallint, p_status text, p_cuenta text default null)
returns json language plpgsql security definer set search_path = public as $$
declare a text := _auth(p_pin); v_cur text; v_cta text := _cuenta(p_cuenta);
begin
  if a <> 'ok' then return json_build_object('error', a); end if;
  select status into v_cur from tickets where n = p_n for update;
  if v_cur is null then return json_build_object('error', 'boleto'); end if;
  if p_status = 'vendido' and v_cur = 'por_verificar' then
    if v_cta is null or v_cta !~ '^[[:alnum:] .#/-]{4,40}$' then return json_build_object('error', 'CUENTA'); end if;
    update tickets set status = 'vendido', vendido_at = now(), cuenta_pago = v_cta where n = p_n;
  elsif p_status = 'por_verificar' and v_cur = 'vendido' then
    update tickets set status = 'por_verificar', vendido_at = null, cuenta_pago = null where n = p_n;
  elsif p_status = 'disponible' and v_cur <> 'disponible' then
    if exists (select 1 from draws where n = p_n) then return json_build_object('error', 'ganador'); end if;
    update tickets set status = 'disponible', nombre = null, telefono = null, cuenta_pago = null,
           reservado_at = null, vendido_at = null, hold_token = null, held_until = null where n = p_n;
  else
    return json_build_object('error', 'transicion');
  end if;
  return json_build_object('ok', true);
end $$;

-- admin_add_sale: la venta manual también exige la cuenta (o "Efectivo").
drop function public.admin_add_sale(text, smallint, text, text);
create function public.admin_add_sale(p_pin text, p_n smallint, p_nombre text, p_tel text, p_cuenta text)
returns json language plpgsql security definer set search_path = public as $$
declare a text := _auth(p_pin); t tickets; v_cta text := _cuenta(p_cuenta);
        v_nom text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
        v_tel text := regexp_replace(coalesce(p_tel, ''), '[^0-9]', '', 'g');
begin
  if a <> 'ok' then return json_build_object('error', a); end if;
  if char_length(v_nom) not between 2 and 80 then return json_build_object('error', 'NOMBRE'); end if;
  if v_tel !~ '^[0-9]{8,15}$' then return json_build_object('error', 'TELEFONO'); end if;
  if v_cta is null or v_cta !~ '^[[:alnum:] .#/-]{4,40}$' then return json_build_object('error', 'CUENTA'); end if;

  if p_n is null then
    select * into t from tickets
     where status = 'disponible' and (held_until is null or held_until < now())
     order by random() limit 1 for update skip locked;
    if t.n is null then return json_build_object('error', 'AGOTADO'); end if;
  else
    select * into t from tickets where n = p_n for update;
    if t.n is null then return json_build_object('error', 'boleto'); end if;
    if t.status <> 'disponible' then return json_build_object('error', 'no_disponible', 'n', t.n, 'status', t.status); end if;
    if t.held_until > now() then return json_build_object('error', 'apartado', 'n', t.n); end if;
  end if;

  update tickets
     set status = 'vendido', nombre = v_nom, telefono = v_tel, cuenta_pago = v_cta,
         reservado_at = now(), vendido_at = now(), hold_token = null, held_until = null
   where n = t.n;
  return json_build_object('ok', true, 'n', t.n);
end $$;

revoke execute on function public.admin_set_status(text, smallint, text, text),
                           public.admin_add_sale(text, smallint, text, text, text) from public, authenticated;
grant execute on function public.admin_set_status(text, smallint, text, text),
                          public.admin_add_sale(text, smallint, text, text, text) to anon;
