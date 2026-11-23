import { CONFIG } from './config.js?v=6';
import { rpc } from './api.js?v=6';
import { $, el, pad, money, fmtDate, dayKey, waLink, toast, confirmDialog } from './util.js?v=6';
import { drawWheel, spinTo, downloadWinner } from './wheel.js?v=6';
import { refreshPublic, loadWhatsapp } from './buy.js?v=6';

const LABEL = { disponible: 'Disponible', por_verificar: 'Por verificar', vendido: 'Vendido' };
const FILTERS = [['all', 'Todos'], ['por_verificar', 'Por verificar'], ['vendido', 'Vendidos'], ['disponible', 'Disponibles']];
const state = { pin: null, tickets: [], draw: null, filter: 'por_verificar', q: '', tab: 'list' };

const fmtPhone = (t) => (t?.length === 8 ? `${t.slice(0, 4)}-${t.slice(4)}` : t ?? '');
const waNumber = (t) => (t.length === 8 ? `504${t}` : t);

// ---------- Sesión ----------
function setView(admin) {
  $('#buyView').hidden = admin;
  $('#adminView').hidden = !admin;
  $('#adminBtn').hidden = admin;
  $('#logoutBtn').hidden = !admin;
  window.scrollTo(0, 0);
}

async function load() {
  const data = await rpc('admin_list', { p_pin: state.pin });
  state.tickets = data.tickets;
  state.draw = data.draw;
  render();
}

function logout() {
  state.pin = null;
  state.tickets = [];
  $('#rows').replaceChildren();
  setView(false);
  refreshPublic();
}

async function guarded(fn) {
  try { await fn(); } catch (e) {
    toast(e.message, 'error');
    if (e.code === 'pin' || e.code === 'locked') logout();
  }
}

// ---------- Render ----------
function render() {
  renderChips();
  renderRows();
  if (state.tab === 'dash') renderDash();
  if (state.tab === 'draw') renderDraw();
}

function counts() {
  const c = { all: state.tickets.length, disponible: 0, por_verificar: 0, vendido: 0 };
  for (const t of state.tickets) c[t.status]++;
  return c;
}

function renderChips() {
  const c = counts();
  $('#chips').replaceChildren(...FILTERS.map(([key, label]) => el('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(state.filter === key),
    text: `${label} (${c[key]})`,
    onclick: () => { state.filter = key; renderChips(); renderRows(); },
  })));
}

function actionBtn(label, cls, n, status, confirm) {
  return el('button', {
    class: `btn btn--xs ${cls}`, type: 'button', text: label,
    onclick: (ev) => guarded(async () => {
      const btn = ev.currentTarget;
      if (confirm && !(await confirmDialog(...confirm))) return;
      btn.disabled = true;
      await rpc('admin_set_status', { p_pin: state.pin, p_n: n, p_status: status });
      toast(`Boleto #${pad(n)} → ${LABEL[status]}`, 'ok');
      await load();
    }),
  });
}

function renderRows() {
  const q = state.q.toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  const list = state.tickets.filter((t) =>
    (state.filter === 'all' || t.status === state.filter) &&
    (!q || String(t.n) === q.replace(/^#?0*/, '') || t.nombre?.toLowerCase().includes(q) ||
      (qDigits.length >= 3 && t.telefono?.includes(qDigits))));

  const frag = document.createDocumentFragment();
  for (const t of list) {
    const acts = el('div', { class: 'acts' });
    if (t.status === 'por_verificar') {
      acts.append(
        actionBtn('✓ Verificar pago', 'btn--primary', t.n, 'vendido'),
        actionBtn('Liberar', 'btn--ghost', t.n, 'disponible',
          [`Liberar boleto #${pad(t.n)}`, `El boleto volverá a estar disponible y se borrarán los datos de ${t.nombre}.`, 'Liberar']),
      );
    } else if (t.status === 'vendido') {
      acts.append(actionBtn('↩ Por verificar', 'btn--ghost', t.n, 'por_verificar'));
    }
    const phone = t.telefono
      ? el('a', { href: waLink(waNumber(t.telefono), `Hola ${t.nombre}, te escribo por tu boleto #${pad(t.n)} de la Rifa Solidaria.`), target: '_blank', rel: 'noopener noreferrer', text: fmtPhone(t.telefono) })
      : '—';
    const empty = (v) => (v ? null : 'is-empty'); // en móvil se ocultan campos vacíos
    frag.append(el('tr', {},
      el('td', { text: `#${pad(t.n)}` }),
      el('td', {}, el('span', { class: `badge badge--${t.status}`, text: LABEL[t.status] })),
      el('td', { 'data-label': 'Nombre', class: empty(t.nombre), text: t.nombre ?? '—' }),
      el('td', { 'data-label': 'Teléfono', class: empty(t.telefono) }, phone),
      el('td', { 'data-label': 'Apartado', class: empty(t.reservado_at), text: fmtDate(t.reservado_at) }),
      el('td', { 'data-label': 'Vendido', class: empty(t.vendido_at), text: fmtDate(t.vendido_at) }),
      el('td', { class: acts.childElementCount ? null : 'is-empty' }, acts),
    ));
  }
  $('#rows').replaceChildren(frag);
  $('#emptyRows').hidden = list.length > 0;
}

function renderDash() {
  const c = counts();
  const kpi = (label, value, sub, cls = '') =>
    el('div', { class: `kpi ${cls}` }, el('small', { text: label }), el('strong', { text: value }), el('span', { class: 'muted', text: sub }));
  $('#kpis').replaceChildren(
    kpi('Vendidos', c.vendido, money(c.vendido * CONFIG.PRICE), 'kpi--ok'),
    kpi('Por verificar', c.por_verificar, money(c.por_verificar * CONFIG.PRICE), 'kpi--warn'),
    kpi('Disponibles', c.disponible, `de ${CONFIG.TOTAL}`),
    kpi('Total apartado', c.vendido + c.por_verificar, `${Math.round(((c.vendido + c.por_verificar) / CONFIG.TOTAL) * 100)}% de los boletos`),
  );
  const got = c.vendido * CONFIG.PRICE;
  $('#goalBar').style.width = `${Math.min(100, (got / CONFIG.GOAL) * 100)}%`;
  $('#goalTxt').textContent = `${money(got)} verificados de ${money(CONFIG.GOAL)} (${Math.round((got / CONFIG.GOAL) * 100)}%) · ${money(c.por_verificar * CONFIG.PRICE)} por verificar`;

  const byDay = new Map();
  for (const t of state.tickets) if (t.reservado_at) { const k = dayKey(t.reservado_at); byDay.set(k, (byDay.get(k) ?? 0) + 1); }
  const days = [...byDay].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...byDay.values());
  const dayFmt = new Intl.DateTimeFormat('es-HN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  $('#daysChart').replaceChildren(...(days.length ? days.map(([k, v]) => el('div', { class: `day ${v === max ? 'day--top' : ''}` },
    el('span', { text: dayFmt.format(new Date(`${k}T12:00:00Z`)) }),
    el('div', { class: 'day__bar', style: `width:${(v / max) * 100}%` }),
    el('b', { text: v }),
  )) : [el('p', { class: 'muted', text: 'Aún no hay ventas registradas.' })]));

  const recent = state.tickets.filter((t) => t.reservado_at).sort((a, b) => b.reservado_at.localeCompare(a.reservado_at)).slice(0, 8);
  $('#recent').replaceChildren(...(recent.length ? recent.map((t) => el('li', {},
    el('span', { text: `#${pad(t.n)} · ${t.nombre}` }),
    el('span', { class: `badge badge--${t.status}`, text: `${LABEL[t.status]} · ${fmtDate(t.reservado_at)}` }),
  )) : [el('li', { class: 'muted', text: 'Sin movimientos.' })]));
}

const soldNums = () => state.tickets.filter((t) => t.status === 'vendido').map((t) => t.n);

function showWinner(d) {
  $('#winnerBox').hidden = !d;
  if (!d) return;
  $('#winNum').textContent = pad(d.n);
  $('#winName').textContent = d.nombre;
  $('#winPhone').textContent = fmtPhone(d.telefono);
  $('#winDate').textContent = `Sorteo realizado: ${fmtDate(d.drawn_at)}`;
}

function renderDraw() {
  const nums = soldNums();
  drawWheel($('#wheel'), nums);
  $('#drawInfo').textContent = `${nums.length} boleto(s) vendido(s) participan.`;
  $('#spinBtn').disabled = nums.length === 0;
  showWinner(state.draw);
}

async function spin() {
  if (state.draw && !(await confirmDialog('Sortear de nuevo',
    `Ya hay un ganador registrado (#${pad(state.draw.n)}). El nuevo resultado será el ganador vigente.`, 'Sortear'))) return;
  const btn = $('#spinBtn');
  btn.disabled = true;
  $('#winnerBox').hidden = true;
  await guarded(async () => {
    const r = await rpc('admin_draw', { p_pin: state.pin });
    await spinTo($('#wheel'), r.pool, r.n);
    state.draw = r;
    showWinner(r);
    $('#winnerBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  btn.disabled = false;
}

function selectTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const t of ['list', 'dash', 'draw']) $(`#tab-${t}`).hidden = t !== tab;
  render();
}

// ---------- Diálogos ----------
function bindDialog(dlg) {
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
}

async function onLogin(ev) {
  ev.preventDefault();
  const pin = $('#pinInput').value.trim();
  const msg = $('#pinMsg');
  if (!/^\d{6}$/.test(pin)) { msg.textContent = 'El PIN debe tener 6 dígitos.'; return; }
  const btn = ev.currentTarget.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    state.pin = pin;
    await load();
    $('#pinDlg').close();
    setView(true);
    selectTab('list');
  } catch (e) {
    state.pin = null;
    msg.textContent = e.message;
  } finally {
    btn.disabled = false;
    $('#pinInput').value = '';
  }
}

async function onChangePin(ev) {
  ev.preventDefault();
  const f = ev.currentTarget;
  const p1 = f.elements.p1.value, p2 = f.elements.p2.value;
  const msg = $('#changePinMsg');
  if (!/^\d{6}$/.test(p1)) { msg.textContent = 'El PIN debe tener exactamente 6 dígitos.'; return; }
  if (p1 !== p2) { msg.textContent = 'Los PIN no coinciden.'; return; }
  try {
    await rpc('admin_change_pin', { p_pin: state.pin, p_new: p1 });
    state.pin = p1;
    f.reset();
    $('#changePinDlg').close();
    toast('PIN actualizado correctamente.', 'ok');
  } catch (e) { msg.textContent = e.message; }
}

async function onSaveWhatsapp(ev) {
  ev.preventDefault();
  const f = ev.currentTarget;
  const v = f.elements.wa.value.replace(/\D/g, '');
  const msg = $('#waMsg');
  if (v.length < 8 || v.length > 15) { msg.textContent = 'Número inválido (8 a 15 dígitos, con código de país).'; return; }
  try {
    await rpc('admin_set_whatsapp', { p_pin: state.pin, p_whatsapp: v });
    await loadWhatsapp();
    $('#waDlg').close();
    toast('WhatsApp actualizado.', 'ok');
  } catch (e) { msg.textContent = e.message; }
}

export function initAdmin() {
  const pinDlg = $('#pinDlg'), cpDlg = $('#changePinDlg'), waDlg = $('#waDlg');
  bindDialog(pinDlg); bindDialog(cpDlg); bindDialog(waDlg);
  $('#waCfgBtn').addEventListener('click', async () => {
    $('#waMsg').textContent = '';
    $('#waForm').elements.wa.value = (await loadWhatsapp()) ?? '';
    waDlg.showModal();
  });
  $('#waForm').addEventListener('submit', onSaveWhatsapp);
  $('#adminBtn').addEventListener('click', () => { $('#pinMsg').textContent = ''; pinDlg.showModal(); $('#pinInput').focus(); });
  $('#pinForm').addEventListener('submit', onLogin);
  $('#changePinBtn').addEventListener('click', () => { $('#changePinMsg').textContent = ''; cpDlg.showModal(); });
  $('#changePinForm').addEventListener('submit', onChangePin);
  $('#logoutBtn').addEventListener('click', logout);
  $('#refreshBtn').addEventListener('click', () => guarded(async () => { await load(); toast('Datos actualizados.'); }));
  $('#search').addEventListener('input', (e) => { state.q = e.target.value.trim(); renderRows(); });
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
  $('#spinBtn').addEventListener('click', spin);
  $('#dlPng').addEventListener('click', () => state.draw && downloadWinner(state.draw, 'image/png'));
  $('#dlJpg').addEventListener('click', () => state.draw && downloadWinner(state.draw, 'image/jpeg'));
  for (const i of document.querySelectorAll('.pin')) i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 6); });
}
