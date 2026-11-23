-- Venta manual desde el panel: registra un boleto ya pagado directamente como vendido.
-- p_n nulo = número disponible al azar.
create function public.admin_add_sale(p_pin text, p_n smallint, p_nombre text, p_tel text)
returns json language plpgsql security definer set search_path = public as $$
declare a text := _auth(p_pin); t tickets;
        v_nom text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
        v_tel text := regexp_replace(coalesce(p_tel, ''), '[^0-9]', '', 'g');
begin
  if a <> 'ok' then return json_build_object('error', a); end if;
  if char_length(v_nom) not between 2 and 80 then return json_build_object('error', 'NOMBRE'); end if;
  if v_tel !~ '^[0-9]{8,15}$' then return json_build_object('error', 'TELEFONO'); end if;

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
     set status = 'vendido', nombre = v_nom, telefono = v_tel, reservado_at = now(), vendido_at = now(),
         hold_token = null, held_until = null
   where n = t.n;
  return json_build_object('ok', true, 'n', t.n);
end $$;

revoke execute on function public.admin_add_sale(text, smallint, text, text) from public, authenticated;
grant execute on function public.admin_add_sale(text, smallint, text, text) to anon;
