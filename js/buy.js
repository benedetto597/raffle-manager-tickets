import { CONFIG } from './config.js?v=9';
import { rpc } from './api.js?v=9';
import { $, pad, money, waLink, sleep, prefersReducedMotion } from './util.js?v=9';
import { settings, loadSettings, onSettings } from './settings.js?v=9';

const HOLD_MS = 9.8 * 60 * 1000; // margen bajo los 10 min del servidor
let hold = null; // { n, token }
let timerId = 0;
let lastLeft = null;

export async function loadWhatsapp() {
  return (await loadSettings()).whatsapp;
}

function renderPrice() {
  $('#factPrice').textContent = money(settings.price);
  $('#donePrice').textContent = money(settings.price);
  if (lastLeft != null) updateProgress(lastLeft);
}

const showStep = (id) => {
  for (const s of ['stepPick', 'stepForm', 'stepDone']) $(`#${s}`).hidden = s !== id;
};

function updateProgress(left) {
  lastLeft = left;
  const total = Math.max(settings.total, left);
  $('#pubBar').style.width = `${((total - left) / total) * 100}%`;
  $('#pubLeft').textContent = left
    ? `Quedan ${left} de ${total} boletos disponibles`
    : '¡Boletos agotados! Gracias por tu apoyo.';
  $('#pickBtn').disabled = left === 0;
}

export async function refreshPublic() {
  try {
    const [nums] = await Promise.all([rpc('available_numbers'), loadSettings()]);
    updateProgress(nums.length);
    return nums;
  } catch (e) {
    $('#pubLeft').textContent = e.message;
    return [];
  }
}

/** Muestra números al azar del pool y desacelera hasta detenerse en `final`. */
async function roll(pool, final) {
  const num = $('#slotNum');
  if (prefersReducedMotion() || pool.length < 2) { num.textContent = pad(final); return; }
  num.parentElement.classList.add('rolling');
  for (let delay = 40; delay < 330; delay *= 1.12) {
    num.textContent = pad(pool[(Math.random() * pool.length) | 0]);
    await sleep(delay);
  }
  num.parentElement.classList.remove('rolling');
  num.textContent = pad(final);
}

function startTimer() {
  const deadline = Date.now() + HOLD_MS;
  const tick = () => {
    const left = deadline - Date.now();
    if (left <= 0) {
      clearInterval(timerId);
      hold = null;
      resetPick('Tu número apartado venció. Vuelve a intentarlo para obtener otro.');
      return;
    }
    const s = Math.ceil(left / 1000);
    $('#holdTimer').textContent = `${String((s / 60) | 0).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  clearInterval(timerId);
  tick();
  timerId = setInterval(tick, 1000);
}

function resetPick(msg = '') {
  $('#slotNum').textContent = '???';
  $('#pickMsg').textContent = msg;
  $('#buyForm').reset();
  $('#formMsg').textContent = '';
  showStep('stepPick');
  refreshPublic();
}

async function onPick() {
  const btn = $('#pickBtn');
  btn.disabled = true;
  $('#pickMsg').textContent = '';
  try {
    const [pool, h] = await Promise.all([rpc('available_numbers'), rpc('hold_ticket')]);
    await roll(pool, h.n);
    hold = { n: h.n, token: h.token };
    await sleep(700);
    $('#formNum').textContent = pad(h.n);
    showStep('stepForm');
    startTimer();
    $('#buyForm').elements.nombre.focus();
  } catch (e) {
    $('#pickMsg').textContent = e.message;
    $('#slotNum').textContent = '???';
  } finally {
    btn.disabled = false;
    refreshPublic();
  }
}

function buildMessage(n, nombre, tel) {
  return [
    '🎗️ *Rifa Solidaria*',
    `Hola, quiero comprar el boleto *#${pad(n)}*.`,
    `👤 Nombre: ${nombre}`,
    `📱 Teléfono: ${tel}`,
    `💵 Monto: ${money(settings.price)}`,
    '',
    'Por favor indícame cómo enviarte el comprobante de pago. ¡Gracias!',
  ].join('\n');
}

async function onSubmit(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  const nombre = form.elements.nombre.value.trim().replace(/\s+/g, ' ');
  const tel = form.elements.telefono.value.replace(/\D/g, '');
  const msg = $('#formMsg');
  if (nombre.length < 2) { msg.textContent = 'Escribe tu nombre completo.'; return; }
  if (tel.length < 8 || tel.length > 15) { msg.textContent = 'Escribe un teléfono válido (8 a 15 dígitos).'; return; }
  if (!hold) { resetPick('Tu número apartado venció. Vuelve a intentarlo.'); return; }

  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  msg.textContent = '';
  try {
    const n = await rpc('confirm_ticket', { p_token: hold.token, p_nombre: nombre, p_tel: tel });
    clearInterval(timerId);
    hold = null;
    const to = settings.whatsapp ?? (await loadWhatsapp()) ?? '';
    const url = waLink(to, buildMessage(n, nombre, tel));
    $('#doneNum').textContent = pad(n);
    $('#waLink').href = url;
    showStep('stepDone');
    window.open(url, '_blank', 'noopener'); // si el navegador lo bloquea, queda el botón
  } catch (e) {
    msg.textContent = e.message;
    if (e.code === 'EXPIRADO') { clearInterval(timerId); hold = null; setTimeout(() => resetPick(e.message), 1500); }
  } finally {
    submit.disabled = false;
  }
}

export function initBuy() {
  $('#factPrize').textContent = 'TV Hisense 32"';
  $('#factDate').textContent = CONFIG.DRAW_DATE;
  renderPrice();
  onSettings(renderPrice);
  $('#pickBtn').addEventListener('click', onPick);
  $('#buyForm').addEventListener('submit', onSubmit);
  $('#againBtn').addEventListener('click', () => resetPick());
  refreshPublic();
}
