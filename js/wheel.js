import { CONFIG } from './config.js?v=10';
import { pad, prefersReducedMotion } from './util.js?v=10';

const COLORS = ['#e84a8a', '#b0186b', '#5b1446', '#f27bb0'];
const TAU = Math.PI * 2;
let rotation = 0;

/** Dibuja la ruleta con los números `nums` y la rotación indicada. */
export function drawWheel(canvas, nums, rot = rotation) {
  const ctx = canvas.getContext('2d');
  const { width: w } = canvas;
  const c = w / 2, r = c - 8;
  ctx.clearRect(0, 0, w, w);
  ctx.save();
  ctx.translate(c, c);
  if (!nums.length) {
    ctx.fillStyle = '#f3d3e3';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a5470';
    ctx.font = '800 22px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin boletos vendidos', 0, 8);
    ctx.restore();
    return;
  }
  const a = TAU / nums.length;
  const labels = nums.length <= 80;
  ctx.font = `800 ${Math.max(11, Math.min(22, 300 / nums.length + 8))}px Nunito, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  nums.forEach((n, i) => {
    const start = rot + i * a;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, start, start + a); ctx.closePath();
    const ci = i % 4;
    ctx.fillStyle = COLORS[i > 0 && i === nums.length - 1 && ci === 0 ? 2 : ci]; // evita dos iguales juntos al cerrar
    ctx.fill();
    if (nums.length <= 120) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.stroke(); }
    if (labels) {
      ctx.save(); ctx.rotate(start + a / 2);
      ctx.fillStyle = '#fff'; ctx.fillText(pad(n), r - 12, 0);
      ctx.restore();
    }
  });
  ctx.lineWidth = 6; ctx.strokeStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, TAU); ctx.fill();
  ctx.font = `${r * 0.18}px serif`; ctx.textAlign = 'center';
  ctx.fillText('🎗️', 0, 2);
  ctx.restore();
}

/** Gira la ruleta hasta dejar `target` bajo el puntero superior. */
export function spinTo(canvas, nums, target) {
  const k = nums.indexOf(target);
  const a = TAU / nums.length;
  const base = -Math.PI / 2 - (k + 0.5) * a + (Math.random() - 0.5) * a * 0.6;
  const from = rotation;
  let to = base;
  while (to < from + TAU * 7) to += TAU;
  if (prefersReducedMotion()) { rotation = to % TAU; drawWheel(canvas, nums); return Promise.resolve(); }
  const dur = 6500, t0 = performance.now();
  return new Promise((resolve) => {
    const frame = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - (1 - p) ** 4;
      drawWheel(canvas, nums, from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(frame);
      else { rotation = to % TAU; resolve(); }
    };
    requestAnimationFrame(frame);
  });
}

const maskPhone = (t) => (t.length > 4 ? `${'•'.repeat(t.length - 4)}${t.slice(-4)}` : t);

/** Genera la imagen del ganador y la descarga como PNG o JPEG. */
export async function downloadWinner(draw, type = 'image/png') {
  await Promise.all([
    document.fonts.load('700 90px "Dancing Script"'),
    document.fonts.load('900 60px Nunito'),
  ]).catch(() => {});
  const S = 1080;
  const cv = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#ffe3ef'); g.addColorStop(1, '#f6c6dd');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5b1446';
  ctx.font = '700 110px "Dancing Script", cursive';
  ctx.fillText('Rifa Solidaria', S / 2, 170);
  ctx.font = '900 44px Nunito, sans-serif';
  ctx.fillStyle = '#b0186b';
  ctx.fillText('🏆 NÚMERO GANADOR 🏆', S / 2, 260);

  // tarjeta del número
  const cw = 620, ch = 300, cx = (S - cw) / 2, cy = 310;
  const cg = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
  cg.addColorStop(0, '#5b1446'); cg.addColorStop(1, '#e84a8a');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 40); ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.font = '900 230px Nunito, sans-serif';
  ctx.fillText(`#${pad(draw.n)}`, S / 2, cy + 235);

  ctx.fillStyle = '#3d0f2f';
  ctx.font = '900 64px Nunito, sans-serif';
  ctx.fillText(draw.nombre, S / 2, 720, S - 120);
  ctx.font = '600 40px Nunito, sans-serif';
  ctx.fillStyle = '#7a5470';
  ctx.fillText(`Tel. ${maskPhone(draw.telefono)}`, S / 2, 785);
  ctx.fillStyle = '#5b1446';
  ctx.font = '800 40px Nunito, sans-serif';
  ctx.fillText(`Premio: ${CONFIG.PRIZE}`, S / 2, 870, S - 120);
  const when = new Intl.DateTimeFormat('es-HN', { timeZone: CONFIG.TZ, dateStyle: 'long', timeStyle: 'short' }).format(new Date(draw.drawn_at));
  ctx.font = '600 34px Nunito, sans-serif';
  ctx.fillStyle = '#7a5470';
  ctx.fillText(`Sorteo realizado el ${when}`, S / 2, 930, S - 120);
  ctx.font = 'italic 600 32px Nunito, sans-serif';
  ctx.fillText('¡Gracias de corazón por apoyar esta causa! 💖', S / 2, 1010, S - 120);

  const blob = await new Promise((r) => cv.toBlob(r, type, 0.92));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ganador-rifa-${pad(draw.n)}.${type === 'image/png' ? 'png' : 'jpg'}`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
