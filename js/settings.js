import { rpc } from './api.js?v=7';
import { CONFIG } from './config.js?v=7';

/** Configuración viva desde la base (meta, precio, total de boletos, WhatsApp). */
export const settings = { goal: 20000, price: CONFIG.PRICE, total: 200, whatsapp: null };

const listeners = new Set();
/** Registra una función que se ejecuta cada vez que cambia la configuración. */
export const onSettings = (fn) => listeners.add(fn);

export async function loadSettings() {
  try {
    Object.assign(settings, await rpc('public_config'));
    listeners.forEach((fn) => fn(settings));
  } catch { /* se mantienen los valores anteriores */ }
  return settings;
}
