-- WhatsApp destino configurable desde el panel (no se versiona en el repo).
alter table public.admin_cfg add column whatsapp text check (whatsapp ~ '^[0-9]{8,15}$');

create function public.public_config()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('whatsapp', whatsapp) from admin_cfg where id = 1;
$$;

create function public.admin_set_whatsapp(p_pin text, p_whatsapp text)
returns json language plpgsql security definer set search_path = public as $$
declare a text := _auth(p_pin); v text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
begin
  if a <> 'ok' then return json_build_object('error', a); end if;
  if v !~ '^[0-9]{8,15}$' then return json_build_object('error', 'TELEFONO'); end if;
  update admin_cfg set whatsapp = v where id = 1;
  return json_build_object('ok', true);
end $$;

revoke execute on function public.public_config(), public.admin_set_whatsapp(text, text) from public, authenticated;
grant execute on function public.public_config(), public.admin_set_whatsapp(text, text) to anon;
