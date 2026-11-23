import { CONFIG } from './config.js?v=10';

export const $ = (sel, root = document) => root.querySelector(sel);
export const pad = (n) => String(n).padStart(3, '0');
export const money = (v) => `${CONFIG.CURRENCY} ${v.toLocaleString('es-HN')}`;

/** Crea un elemento con texto seguro (nunca innerHTML con datos de usuario). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.style.cssText = v; // CSSOM: permitido por la CSP (sin 'unsafe-inline')
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

const dtFmt = new Intl.DateTimeFormat('es-HN', { timeZone: CONFIG.TZ, dateStyle: 'medium', timeStyle: 'short' });
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.TZ }); // YYYY-MM-DD
export const fmtDate = (iso) => (iso ? dtFmt.format(new Date(iso)) : '—');
export const dayKey = (iso) => dayFmt.format(new Date(iso));

export const waLink = (phone, text) =>
  `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(text)}`;

export function toast(msg, kind = 'info') {
  const t = el('div', { class: `toast toast--${kind}`, role: 'status', text: msg });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 4500);
}

/** Ventana de confirmación con el estilo de la app. Resuelve true si se acepta. */
export function confirmDialog(title, message, okText = 'Aceptar') {
  const dlg = $('#confirmDlg');
  $('#confirmTitle').textContent = title;
  $('#confirmMsg').textContent = message;
  $('#confirmOk').textContent = okText;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }));
}

export const sleep =(ms) => new Promise((r) => setTimeout(r, ms));
export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
