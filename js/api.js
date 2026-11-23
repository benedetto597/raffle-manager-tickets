import { CONFIG } from './config.js?v=10';

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
  CUENTA: 'Escribe el número de cuenta de origen del pago (4 a 40 caracteres: letras, números, espacios o - . # /).',
  no_disponible: (d) => `El boleto #${String(d.n).padStart(3, '0')} no está disponible (${d.status === 'vendido' ? 'ya está vendido' : 'está por verificar'}).`,
  apartado: (d) => `El boleto #${String(d.n).padStart(3, '0')} lo está comprando alguien en este momento. Elige otro o intenta en unos minutos.`,
  meta_multiplo: 'La meta debe ser un múltiplo del precio del boleto.',
  meta_max: 'La meta es demasiado alta (máximo 5000 boletos).',
  meta_ocupado: (d) => `No se puede reducir: el boleto #${String(d.n).padStart(3, '0')} ya está apartado, vendido o es ganador. Solo se eliminan boletos libres del final.`,
};

export class ApiError extends Error {
  constructor(code, data = {}) {
    const m = MESSAGES[code];
    super(typeof m === 'function' ? m(data) : m ?? 'Ocurrió un error de conexión. Intenta de nuevo.');
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
  if (data && typeof data === 'object' && 'error' in data) throw new ApiError(data.error, data);
  return data;
}
