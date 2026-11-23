-- Meta configurable desde el panel. Total de boletos = meta / precio.
alter table public.tickets drop constraint tickets_n_check;
alter table public.tickets add constraint tickets_n_check check (n between 1 and 5000);

alter table public.admin_cfg
  add column goal  int not null default 20000 check (goal > 0),
  add column price int not null default 100   check (price > 0);

create or replace function public.public_config()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('whatsapp', whatsapp, 'goal', goal, 'price', price,
                           'total', (select count(*) from tickets))
  from admin_cfg where id = 1;
$$;

-- Cambia la meta: agrega boletos al final o elimina los últimos si están libres.
create function public.admin_set_goal(p_pin text, p_goal int)
returns json language plpgsql security definer set search_path = public as $$
declare a text := _auth(p_pin); c admin_cfg; v_total int; v_cur int; v_block smallint;
begin
  if a <> 'ok' then return json_build_object('error', a); end if;
  select * into c from admin_cfg where id = 1;
  if p_goal is null or p_goal <= 0 or p_goal % c.price <> 0 then
    return json_build_object('error', 'meta_multiplo');
  end if;
  v_total := p_goal / c.price;
  if v_total > 5000 then return json_build_object('error', 'meta_max'); end if;

  lock table tickets in share row exclusive mode; -- evita apartados mientras se ajusta
  select count(*) into v_cur from tickets;
  if v_total > v_cur then
    insert into tickets (n) select generate_series(v_cur + 1, v_total);
  elsif v_total < v_cur then
    select n into v_block from tickets
     where n > v_total and (status <> 'disponible' or held_until > now() or n in (select n from draws))
     order by n limit 1;
    if v_block is not null then
      return json_build_object('error', 'meta_ocupado', 'n', v_block);
    end if;
    delete from tickets where n > v_total;
  end if;
  update admin_cfg set goal = p_goal where id = 1;
  return json_build_object('ok', true, 'total', v_total);
end $$;

revoke execute on function public.admin_set_goal(text, int) from public, authenticated;
grant execute on function public.admin_set_goal(text, int), public.public_config() to anon;
