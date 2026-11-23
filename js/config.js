// Configuración pública. La publishable key de Supabase es pública por diseño:
// la seguridad la dan RLS + funciones SECURITY DEFINER en la base de datos.
export const CONFIG = Object.freeze({
  SUPABASE_URL: 'https://sbpegdukstibuicnmnmg.supabase.co',
  SUPABASE_KEY: 'sb_publishable_pT_S7AOdZ1NuuVNowXejLg_qIyfGWQi',
  // El WhatsApp de la encargada se configura desde el panel (RPC public_config), no se versiona.
  TOTAL: 200,
  PRICE: 100,
  GOAL: 20000,
  CURRENCY: 'L',
  PRIZE: 'Televisor Hisense Smart TV 32" HD',
  DRAW_DATE: '22/12/2026',
  TZ: 'America/Tegucigalpa',
});
