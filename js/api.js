import { CONFIG } from './config.js?v=6';

const MESSAGES = {
  AGOTADO: 'Ya no quedan boletos disponibles. ¡Gracias por tu apoyo!',
  OCUPADO: 'Hay muchas personas comprando ahora mismo. Intenta de nuevo en unos minutos.',
  EXPIRADO: 'Tu número apartado venció. Vuelve a intentarlo para obtener otro.',
  NOMBRE: 'Escribe tu nombre completo (2 a 80 caracteres).',
  TELEFONO: 'Escribe un teléfono válido (8 a 15 dígitos).',
  pin: 'PIN incorrecto.',
  locked: 'Demasiados intentos fallidos. Espera 10 minutos.',
  formato: 'El PIN debe tener exactamente 6 dígitos.',
  transicion: 'Ese cambio de estado no está permitido.',
  ganador: 'No se puede liberar el boleto ganador.',
  sin_vendidos: 'Aún no hay boletos vendidos (verificados) para sortear.',
  boleto: 'Boleto no encontrado.',
};

export class ApiError extends Error {
  constructor(code) {
    super(MESSAGES[code] ?? 'Ocurrió un error de conexión. Intenta de nuevo.');
    this.code = code;
  }
}

/** Llama a una función RPC de Supabase. Lanza ApiError con mensaje en español. */
export async function rpc(fn, args = {}) {
  let res;
  try {
    res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('RED');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message ?? 'RED');
  if (data && typeof data === 'object' && 'error' in data) throw new ApiError(data.error);
  return data;
}
