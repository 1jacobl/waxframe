'use strict';
/* =========================================================
   Waxframe: turn audio snippets into shareable videos
   ========================================================= */

/* ---------- tiny utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeBack = x => { x = clamp(x, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const fmt = s => { s = Math.max(0, s || 0); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
const fmtP = s => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0'); };
const parseT = str => {
  if (str == null) return null; str = String(str).trim(); if (!str) return null;
  const p = str.split(':').map(Number); if (p.some(n => isNaN(n))) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
};
const rand = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const F = { d: '"Bricolage Grotesque", system-ui, sans-serif', m: '"Geist Mono", ui-monospace, monospace', v: '"VT323", ui-monospace, monospace', s: '"Instrument Serif", Georgia, serif' };
const font = (w, s, f = F.d) => `${w} ${Math.max(1, s).toFixed(1)}px ${f}`;
const hexToRgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 }; };
const rgbToHex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const rgba = (c, a) => `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;
const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const slug = s => (s || 'snippet').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'snippet';

/* ---------- canvas helpers ---------- */
function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}
function wrapWords(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean); const lines = []; let cur = [];
  for (const w of words) {
    if (cur.length && ctx.measureText([...cur, w].join(' ')).width > maxW) { lines.push(cur); cur = [w]; }
    else cur.push(w);
  }
  if (cur.length) lines.push(cur);
  return lines;
}
function fitSize(ctx, text, weight, size, maxW, fam = F.d, min = 0.3) {
  let s = size; ctx.font = font(weight, s, fam);
  while (ctx.measureText(text).width > maxW && s > size * min) { s *= 0.95; ctx.font = font(weight, s, fam); }
  return s;
}
function ellip(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/* ---------- per-cover caches (blurred bg, VHS bg) ---------- */
const coverCaches = new WeakMap();
function cacheFor(S, W, H) {
  let m = coverCaches.get(S.cover); if (!m) { m = new Map(); coverCaches.set(S.cover, m); }
  const k = W + 'x' + H; let c = m.get(k); if (!c) { c = {}; m.set(k, c); } return c;
}
function blurBg(S, W, H) {
  const c = cacheFor(S, W, H); if (c.blur) return c.blur;
  const out = mk(W, H), o = out.getContext('2d');
  const q = mk(Math.max(8, W / 6), Math.max(8, H / 6)), qc = q.getContext('2d');
  if ('filter' in qc) {
    qc.filter = `blur(${Math.max(2, q.width / 18)}px) saturate(1.35)`;
    drawCover(qc, S.cover, -q.width * 0.15, -q.height * 0.15, q.width * 1.3, q.height * 1.3);
  } else {
    const t = mk(18, 18 * H / W); drawCover(t.getContext('2d'), S.cover, 0, 0, t.width, t.height);
    qc.imageSmoothingQuality = 'high'; qc.drawImage(t, 0, 0, q.width, q.height);
  }
  o.imageSmoothingQuality = 'high'; o.drawImage(q, 0, 0, W, H);
  return (c.blur = out);
}
function retroBg(S, W, H) {
  const c = cacheFor(S, W, H); if (c.retro) return c.retro;
  const out = mk(W, H), o = out.getContext('2d'); drawCover(o, S.cover, 0, 0, W, H);
  const id = o.getImageData(0, 0, out.width, out.height), p = id.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = p[i] * .3 + p[i + 1] * .59 + p[i + 2] * .11;
    p[i] = (l * .5 + p[i] * .5 - 128) * 1.2 + 140;
    p[i + 1] = (l * .5 + p[i + 1] * .5 - 128) * 1.2 + 128;
    p[i + 2] = (l * .5 + p[i + 2] * .5 - 128) * 1.2 + 112;
  }
  o.putImageData(id, 0, 0);
  return (c.retro = out);
}
let NOISE;
function noiseTex() {
  if (NOISE) return NOISE;
  const c = mk(220, 220), x = c.getContext('2d'), d = x.createImageData(220, 220);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); return (NOISE = c);
}
function grain(S, a) {
  const { ctx, W, H } = S; ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'overlay';
  const ox = Math.floor(rand(S.t * 30) * 220), oy = Math.floor(rand(S.t * 17 + 3) * 220);
  ctx.translate(-ox, -oy); ctx.fillStyle = ctx.createPattern(noiseTex(), 'repeat'); ctx.fillRect(ox, oy, W, H); ctx.restore();
}
const SCAN = {};
function scanlines(S) {
  const { ctx, W, H, u } = S; const p = Math.max(2, Math.round(4 * u));
  let c = SCAN[p]; if (!c) { c = mk(4, p); const x = c.getContext('2d'); x.fillStyle = 'rgba(0,0,0,.38)'; x.fillRect(0, 0, 4, Math.ceil(p / 2)); SCAN[p] = c; }
  ctx.save(); ctx.fillStyle = ctx.createPattern(c, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
}
function drawBlurBg(S, dark) { const { ctx, W, H } = S; ctx.drawImage(blurBg(S, W, H), 0, 0); ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, W, H); }
function vignette(S, a = .55) {
  const { ctx, W, H } = S;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function coverSq(S, x, y, s, r, flat) {
  const { ctx, u } = S; ctx.save();
  if (!flat) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40 * u; ctx.shadowOffsetY = 18 * u; }
  ctx.fillStyle = '#111'; rr(ctx, x, y, s, s, r); ctx.fill();
  ctx.shadowColor = 'transparent'; rr(ctx, x, y, s, s, r); ctx.clip(); drawCover(ctx, S.cover, x, y, s, s); ctx.restore();
}

/* ---------- layout ---------- */
const isLand = S => S.W / S.H > 1.15;
const safeTop = S => S.H / S.W > 1.5 ? S.H * 0.13 : S.H * 0.08;
function heroLayout(S) {
  const { W, H, u } = S;
  if (isLand(S)) {
    const s = Math.min(H * 0.66, W * 0.38); const cx = W * 0.1 + s / 2; const tx = cx + s / 2 + W * 0.07; const tw = W - tx - W * 0.07;
    const metaH = (S.showProgress ? 250 : 165) * u; const ty = Math.max(H * 0.1, (H - metaH - 200 * u) / 2);
    return { land: true, s, cx, cy: H / 2, text: { x: tx, y: ty, w: tw, align: 'left' }, lyric: { x: tx, y: ty + metaH, w: tw, align: 'left' } };
  }
  const s = Math.min(W * 0.7, H * 0.42); const cy = safeTop(S) + (H / W > 1.5 ? H * 0.025 : 0) + s / 2; const ty = cy + s / 2 + 64 * u;
  const tall = H / W > 1.5; const tx = tall ? W * 0.1 : W * 0.1, tw = tall ? W * 0.76 : W * 0.8;
  return { land: false, s, cx: W / 2, cy, text: { x: tx, y: ty, w: tw, align: 'center' }, lyric: { x: tall ? W * 0.09 : W * 0.08, y: ty + (S.showProgress ? 225 : 140) * u, w: tall ? W * 0.78 : W * 0.84, align: 'center' } };
}
function drawProgress(S, x, y, w, o = {}) {
  const { ctx, u } = S; const h = (o.ph || 7) * u; ctx.save();
  ctx.fillStyle = o.track || 'rgba(255,255,255,.22)'; rr(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = o.fill || '#fff'; rr(ctx, x, y, Math.max(h, w * S.p), h, h / 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w * S.p, y + h / 2, h * 1.35, 0, Math.PI * 2); ctx.fill();
  ctx.font = font(500, 22 * u, F.m); ctx.fillStyle = o.timeColor || 'rgba(255,255,255,.65)'; ctx.textBaseline = 'top';
  ctx.textAlign = 'left'; ctx.fillText(fmt(S.el), x, y + h + 14 * u);
  ctx.textAlign = 'right'; ctx.fillText('-' + fmt(S.dur - S.el), x + w, y + h + 14 * u);
  ctx.restore();
}
function drawMeta(S, b, o = {}) {
  const { ctx, u } = S; ctx.save(); ctx.textAlign = b.align; ctx.textBaseline = 'alphabetic';
  const ax = b.align === 'center' ? b.x + b.w / 2 : b.x; let y = b.y;
  if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 24 * u; }
  const ts = fitSize(ctx, S.title, 800, (o.ts || 62) * u, b.w); y += ts * 0.9;
  ctx.fillStyle = o.color || '#fff'; ctx.fillText(S.title, ax, y);
  const as = (o.as || 34) * u; ctx.font = font(500, as); ctx.fillStyle = o.sub || 'rgba(255,255,255,.72)';
  y += as * 1.5; ctx.fillText(ellip(ctx, S.artist, b.w), ax, y); ctx.restore();
  if (S.showProgress) { y += 44 * u; drawProgress(S, b.x, y, b.w, o); y += 60 * u; }
  return y;
}

/* ---------- lyrics ---------- */
function lineEnd(line, next) {
  const words = line.text.split(/\s+/).length;
  const cap = line.t + Math.max(4, words * 0.7 + 2.5);
  return next ? Math.min(next.t, cap) : line.t + Math.max(3, words * 0.6 + 1.5);
}
function curLyric(S) {
  const L = S.lyrics; if (!L || !L.length) return null;
  let i = -1; for (let k = 0; k < L.length; k++) { if (L[k].t <= S.t) i = k; else break; }
  if (i < 0) return null;
  const line = L[i], next = L[i + 1] || null, end = lineEnd(line, next), age = S.t - line.t;
  if (S.t > end + 0.35) return null;
  return { line, next, age, len: end - line.t, end };
}
function txt(ctx, w, x, y, col, b) {
  if (b.chroma) { ctx.fillStyle = 'rgba(255,40,90,.75)'; ctx.fillText(w, x - b.chroma, y); ctx.fillStyle = 'rgba(40,220,255,.75)'; ctx.fillText(w, x + b.chroma, y); }
  ctx.fillStyle = col; ctx.fillText(w, x, y);
}
function drawLyrics(S, b) {
  const c = curLyric(S); if (!c || !c.line.text.trim()) return;
  const { ctx, u } = S; const st = S.lyricStyle; const size = b.size; const fam = b.fam || F.d; const wt = b.weight || 750;
  ctx.save(); ctx.font = font(wt, size, fam);
  const lines = wrapWords(ctx, c.line.text, b.w).slice(0, b.maxLines || 3); const lh = size * (b.lh || 1.14);
  const inA = ease(c.age / 0.38);
  const outA = clamp((c.end + 0.35 - S.t) / 0.35, 0, 1) * (c.next && c.next.t <= c.end + 0.01 ? clamp((c.next.t - S.t) / 0.18, 0, 1) : 1);
  const alpha = (st === 'karaoke' ? clamp(c.age / 0.12, 0, 1) : inA) * outA;
  const dy = st === 'fade' ? (1 - inA) * 30 * u : 0;
  const sc = st === 'pop' ? 0.78 + 0.22 * easeBack(c.age / 0.42) : 1;
  const tot = lines.length * lh;
  const y0 = (b.valign === 'middle' ? b.y - tot / 2 + size * 0.82 : b.y + size * 0.82) + dy;
  const px = b.align === 'center' ? b.x + b.w / 2 : b.align === 'right' ? b.x + b.w : b.x;
  const pcy = y0 - size * 0.8 + tot / 2;
  ctx.translate(px, pcy); ctx.scale(sc, sc); ctx.translate(-px, -pcy);
  ctx.globalAlpha = alpha; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (b.shadow) { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 26 * u; ctx.shadowOffsetY = 4 * u; }
  const nW = lines.reduce((a, l) => a + l.length, 0);
  const rev = clamp(c.age / Math.max(0.4, c.len * 0.82), 0, 1) * nW;
  const sp = ctx.measureText(' ').width; let wi = 0;
  lines.forEach((ws, li) => {
    const lw = ctx.measureText(ws.join(' ')).width;
    let x = b.align === 'center' ? b.x + (b.w - lw) / 2 : b.align === 'right' ? b.x + b.w - lw : b.x;
    const y = y0 + li * lh;
    if (b.box) { ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillStyle = b.box; const pad = size * 0.22; ctx.fillRect(x - pad, y - size * 0.78, lw + pad * 2, size * 1.02); ctx.restore(); }
    for (const w of ws) {
      const ww = ctx.measureText(w).width;
      if (st === 'karaoke') {
        const k = clamp(rev - wi, 0, 1);
        txt(ctx, w, x, y, b.dim || 'rgba(255,255,255,.32)', b);
        if (k > 0) { ctx.save(); ctx.globalAlpha = alpha * k; txt(ctx, w, x, y, b.color, b); ctx.restore(); }
      } else txt(ctx, w, x, y, b.color, b);
      x += ww + sp; wi++;
    }
  });
  if (b.showNext !== false && c.next && c.next.text.trim()) {
    const ns = size * 0.56; ctx.font = font(wt, ns, fam); if (!b.shadow) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; } else { ctx.shadowBlur = 14 * u; ctx.shadowColor = 'rgba(0,0,0,.6)'; }
    ctx.globalAlpha = 0.6 * alpha; ctx.textAlign = b.align; ctx.fillStyle = b.nextColor || 'rgba(255,255,255,.75)';
    ctx.fillText(ellip(ctx, c.next.text, b.w), px, y0 + (lines.length - 1) * lh + size * 0.45 + ns * 1.25);
  }
  ctx.restore();
}

/* ---------- icons ---------- */
function tri(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x, y - s / 2); ctx.lineTo(x + s * 0.87, y); ctx.lineTo(x, y + s / 2); ctx.closePath(); ctx.fill(); }
function skipIcon(ctx, x, y, s, d) { ctx.save(); ctx.translate(x, y); ctx.scale(d, 1); tri(ctx, -0.8 * s, 0, s * 0.7); tri(ctx, -0.2 * s, 0, s * 0.7); ctx.fillRect(0.42 * s, -0.35 * s, 0.13 * s, 0.7 * s); ctx.restore(); }
function controls(S, cx, cy, s, col) {
  const { ctx } = S; ctx.save(); ctx.fillStyle = col;
  if (S.playing) { rr(ctx, cx - s * 0.34, cy - s * 0.4, s * 0.24, s * 0.8, s * 0.06); ctx.fill(); rr(ctx, cx + s * 0.1, cy - s * 0.4, s * 0.24, s * 0.8, s * 0.06); ctx.fill(); }
  else tri(ctx, cx - s * 0.3, cy, s * 0.85);
  skipIcon(ctx, cx - s * 2.1, cy, s * 0.6, -1); skipIcon(ctx, cx + s * 2.1, cy, s * 0.6, 1);
  ctx.restore();
}

/* ---------- waveform peaks ---------- */
function demoPeaks(N) { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = 0.25 + 0.5 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) + 0.25 * Math.abs(Math.sin(i * 2.1)); return o; }
function snippetPeaks(S, N) {
  if (!S.peaks) return demoPeaks(N);
  const cache = S.peaks.cache || (S.peaks.cache = new Map());
  const k = N + '|' + S.start.toFixed(2) + '|' + S.end.toFixed(2); if (cache.has(k)) return cache.get(k);
  if (cache.size > 40) cache.clear();
  const d = S.peaks.data, P = d.length, out = new Float32Array(N); let mx = 1e-4;
  for (let i = 0; i < N; i++) {
    const a = Math.floor((S.start + (i / N) * (S.end - S.start)) / S.peaks.dur * P);
    const b = Math.max(a + 1, Math.floor((S.start + ((i + 1) / N) * (S.end - S.start)) / S.peaks.dur * P));
    let m = 0; for (let j = a; j < b && j < P; j++) m = Math.max(m, d[j]); out[i] = m; mx = Math.max(mx, m);
  }
  for (let i = 0; i < N; i++) out[i] = Math.pow(out[i] / mx, 0.85);
  cache.set(k, out); return out;
}

/* =========================================================
   STYLES
   ========================================================= */
function tonearm(S, cx, cy, r) {
  const { ctx, u } = S; const px = cx + r * 0.98, py = cy - r * 0.92;
  const a = Math.PI * (0.6 + 0.1 * (S.p || 0)); const len = r * 1.05;
  const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 20 * u; ctx.shadowOffsetY = 10 * u;
  ctx.lineCap = 'round'; ctx.strokeStyle = '#d8d8de'; ctx.lineWidth = r * 0.032;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = '#bfbfc6'; rr(ctx, -r * 0.03, -r * 0.045, r * 0.14, r * 0.09, r * 0.015); ctx.fill(); ctx.restore();
  ctx.save(); ctx.fillStyle = '#26262c'; ctx.beginPath(); ctx.arc(px, py, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d0d0d7'; ctx.beginPath(); ctx.arc(px, py, r * 0.055, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

const INK = { r: 16, g: 15, b: 20 };
const BONE = '#f1eee8', BONE_SUB = 'rgba(241,238,232,.62)';
const lum = c => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
const flat = (S, c) => { S.ctx.fillStyle = typeof c === 'string' ? c : rgba(c, 1); S.ctx.fillRect(0, 0, S.W, S.H); };
function thinProgress(S, x, y, w, col, track, timeCol) {
  const { ctx, u } = S; const h = 4 * u;
  ctx.fillStyle = track; ctx.fillRect(x, y, w, h); ctx.fillStyle = col; ctx.fillRect(x, y, w * S.p, h);
  ctx.save(); ctx.font = font(400, 24 * u, F.m); ctx.fillStyle = timeCol; ctx.textBaseline = 'top';
  ctx.textAlign = 'left'; ctx.fillText(fmt(S.el), x, y + h + 14 * u); ctx.textAlign = 'right'; ctx.fillText(fmt(S.dur), x + w, y + h + 14 * u); ctx.restore();
}
/* Giant word-by-word lyric block (Type look). Falls back to the title when no line is active. */
function bigWords(S, A, ink, soft) {
  const { ctx, u } = S; const c = curLyric(S);
  const isTitle = !c || !c.line.text.trim(); const text = isTitle ? S.title : c.line.text;
  const age = isTitle ? 99 : c.age, len = isTitle ? 1 : c.len;
  let size = Math.min(200 * u, A.w * 0.24), lines;
  for (;;) {
    ctx.font = font(800, size); lines = wrapWords(ctx, text, A.w);
    const wide = lines.some(l => ctx.measureText(l.join(' ')).width > A.w);
    if ((!wide && lines.length * size * 0.96 <= A.h && lines.length <= 5) || size < 36 * u) break; size *= 0.93;
  }
  const lh = size * 0.96, tot = lines.length * lh, y0 = A.y + (A.h - tot) / 2 + size * 0.8;
  const nW = lines.reduce((a, l) => a + l.length, 0); const step = Math.min(0.2, (len * 0.55) / Math.max(1, nW));
  const outA = isTitle ? 1 : clamp((c.end + 0.3 - S.t) / 0.3, 0, 1) * (c.next && c.next.t <= c.end + 0.01 ? clamp((c.next.t - S.t) / 0.15, 0, 1) : 1);
  const rev = clamp(age / Math.max(0.4, len * 0.85), 0, 1) * nW; const st = S.lyricStyle;
  ctx.save(); ctx.font = font(800, size); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  if ('letterSpacing' in ctx) ctx.letterSpacing = (-0.03 * size).toFixed(1) + 'px';
  const sp = ctx.measureText(' ').width; let wi = 0;
  lines.forEach((ws, li) => {
    let x = A.x; const y = y0 + li * lh;
    for (const w of ws) {
      const ww = ctx.measureText(w).width;
      if (isTitle) { ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.fillText(w, x, y); }
      else if (st === 'karaoke') {
        ctx.globalAlpha = outA; ctx.fillStyle = soft; ctx.fillText(w, x, y);
        const k = clamp(rev - wi, 0, 1); if (k > 0) { ctx.globalAlpha = outA * k; ctx.fillStyle = ink; ctx.fillText(w, x, y); }
      } else {
        const k = clamp((age - wi * step) / 0.2, 0, 1); if (k > 0) {
          ctx.save(); ctx.globalAlpha = outA * Math.min(1, k * 1.6); ctx.fillStyle = ink;
          if (st === 'pop') { const s = 0.55 + 0.45 * easeBack(k); ctx.translate(x, y); ctx.scale(s, s); ctx.fillText(w, 0, 0); }
          else ctx.fillText(w, x, y + (1 - ease(k)) * size * 0.28);
          ctx.restore();
        }
      }
      x += ww + sp; wi++;
    }
  });
  ctx.restore();
}

const STYLES = {
  record: {
    name: 'Record', blurb: 'spinning vinyl',
    draw(S) {
      const { ctx, u } = S; const TAU = Math.PI * 2;
      flat(S, mix(S.color, INK, .8)); grain(S, .05);
      const L = heroLayout(S); const r = L.s / 2, cx = L.cx, cy = L.cy;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(S.t * 0.55 * TAU);
      ctx.fillStyle = '#0b0a0d'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.lineWidth = Math.max(1, 1.3 * u);
      for (let i = 0; i < 34; i++) { const rad = r * 0.4 + r * 0.56 * (i / 33); ctx.strokeStyle = `rgba(241,238,232,${i % 4 === 0 ? 0.07 : 0.03})`; ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); ctx.stroke(); }
      const lr = r * 0.36;
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, lr, 0, TAU); ctx.clip(); drawCover(ctx, S.cover, -lr, -lr, lr * 2, lr * 2); ctx.restore();
      ctx.fillStyle = '#0b0a0d'; ctx.beginPath(); ctx.arc(0, 0, r * 0.028, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip(); ctx.globalCompositeOperation = 'screen';
      const sh = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      sh.addColorStop(0.3, 'rgba(255,255,255,0)'); sh.addColorStop(0.43, 'rgba(255,255,255,.08)'); sh.addColorStop(0.52, 'rgba(255,255,255,0)');
      ctx.fillStyle = sh; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); ctx.restore();
      tonearm(S, cx, cy, r);
      drawMeta(S, L.text, { color: BONE, sub: BONE_SUB, fill: S.accent, track: 'rgba(241,238,232,.18)', timeColor: BONE_SUB, ph: 5 });
      drawLyrics(S, { ...L.lyric, size: 58 * u, color: BONE, nextColor: BONE_SUB });
    }
  },

  sleeve: {
    name: 'Sleeve', blurb: 'full-bleed cover',
    draw(S) {
      const { ctx, W, H, u } = S; flat(S, mix(S.color, INK, .84));
      const push = 1 + 0.05 * S.p; const m = W * 0.08;
      const pic = (x, y, w, h) => { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); drawCover(ctx, S.cover, x - w * (push - 1) / 2, y - h * (push - 1) / 2, w * push, h * push); ctx.restore(); };
      const meta = (x, y, w, ts) => {
        ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = BONE;
        if ('letterSpacing' in ctx) ctx.letterSpacing = (-0.03 * ts * u).toFixed(1) + 'px';
        const s = fitSize(ctx, S.title, 800, ts * u, w); ctx.fillText(S.title, x, y + s * 0.82);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        ctx.font = font(500, 36 * u); ctx.fillStyle = BONE_SUB; ctx.fillText(ellip(ctx, S.artist, w), x, y + s * 0.82 + 54 * u);
        ctx.restore(); return y + s * 0.82 + 54 * u;
      };
      if (H / W >= 1.2) {
        const ch = Math.min(W, H * 0.52); pic(0, 0, W, ch);
        const tw = W - 2 * m - (H / W > 1.5 ? W * 0.04 : 0);
        let y = meta(m, ch + 60 * u, tw, 92) + 46 * u;
        if (S.showProgress) { thinProgress(S, m, y, tw, S.accent, 'rgba(241,238,232,.16)', BONE_SUB); y += 92 * u; }
        drawLyrics(S, { x: m, y, w: tw, align: 'left', size: 60 * u, color: BONE, nextColor: BONE_SUB });
      } else {
        const cs = Math.min(H, W * 0.5); pic(0, 0, cs, H);
        const tx = cs + m * 0.9, tw = W - tx - m;
        let y = meta(tx, H * 0.16, tw, 86) + 44 * u;
        if (S.showProgress) { thinProgress(S, tx, y, tw, S.accent, 'rgba(241,238,232,.16)', BONE_SUB); y += 92 * u; }
        drawLyrics(S, { x: tx, y, w: tw, align: 'left', size: 54 * u, color: BONE, nextColor: BONE_SUB });
      }
    }
  },

  type: {
    name: 'Type', blurb: 'giant lyrics',
    draw(S) {
      const { ctx, W, H, u } = S; const field = hexToRgb(S.accent); flat(S, S.accent); grain(S, .05);
      const dark = lum(field) > 0.55; const ink = dark ? '#16151a' : BONE; const soft = dark ? 'rgba(22,21,26,.28)' : 'rgba(241,238,232,.36)';
      const tall = H / W > 1.5; const m = W * 0.08; const top = safeTop(S); const right = tall ? W * 0.13 : m;
      const hs = Math.min(W, H) * 0.095; coverSq(S, m, top, hs, 0, true);
      ctx.save(); ctx.fillStyle = ink; ctx.textBaseline = 'alphabetic'; const tw = W - m - right - hs - 26 * u;
      ctx.font = font(700, 34 * u); ctx.fillText(ellip(ctx, S.title, tw), m + hs + 26 * u, top + hs * 0.46);
      ctx.font = font(500, 30 * u); ctx.globalAlpha = .7; ctx.fillText(ellip(ctx, S.artist, tw), m + hs + 26 * u, top + hs * 0.46 + 42 * u); ctx.restore();
      const bottom = tall ? H * 0.78 : H - m * 1.3; const ay = top + hs + 50 * u;
      bigWords(S, { x: m, y: ay, w: W - m - right, h: bottom - ay - 40 * u }, ink, soft);
      if (S.showProgress) {
        ctx.fillStyle = soft; ctx.fillRect(m, bottom, W - m - right, 5 * u); ctx.fillStyle = ink; ctx.fillRect(m, bottom, (W - m - right) * S.p, 5 * u);
      }
    }
  },

  wave: {
    name: 'Waveform', blurb: 'for producers',
    draw(S) {
      const { ctx, W, H, u } = S; flat(S, mix(S.color, INK, .88)); grain(S, .06);
      const land = isLand(S); const m = W * (land ? 0.07 : 0.08); let top = safeTop(S);
      if (!land && H / W < 1.5) { const hs0 = Math.min(W * 0.2, H * 0.12), wh0 = Math.min(W * 0.42, H * 0.2); const blk = hs0 + 90 * u + wh0 + 40 * u + 84 * u + 50 * u + 200 * u; top = Math.max(top, (H - blk) / 2); }
      const rightPad = H / W > 1.5 ? W * 0.04 : 0;
      const hs = land ? H * 0.15 : Math.min(W * 0.2, H * 0.12); coverSq(S, m, top, hs, 0, true);
      const tx = m + hs + 28 * u, tw = W - tx - m - rightPad;
      ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.fillStyle = BONE; fitSize(ctx, S.title, 800, 54 * u, tw); ctx.fillText(S.title, tx, top + hs * 0.5);
      ctx.font = font(500, 32 * u); ctx.fillStyle = BONE_SUB; ctx.fillText(ellip(ctx, S.artist, tw), tx, top + hs * 0.5 + 46 * u); ctx.restore();
      const wx = m, ww = W - 2 * m - rightPad, wh = land ? H * 0.22 : Math.min(W * 0.42, H * 0.2);
      const wcy = land ? H * 0.45 : top + hs + 90 * u + wh / 2;
      const N = land ? 120 : 64; const pk = snippetPeaks(S, N); const bw = ww / N;
      for (let i = 0; i < N; i++) {
        const f = (i + 0.5) / N; const played = f <= S.p; const near = Math.abs(f - S.p) < 0.025;
        let v = pk[i]; if (near && S.playing) v = Math.min(1, v * (1 + S.bass * 0.5));
        const h = Math.max(6 * u, v * wh);
        ctx.fillStyle = played ? S.accent : 'rgba(241,238,232,.18)';
        ctx.fillRect(wx + i * bw + bw * 0.2, wcy - h / 2, bw * 0.6, h);
      }
      ctx.fillStyle = BONE; ctx.fillRect(wx + ww * S.p - 1.5 * u, wcy - wh * 0.62, 3 * u, wh * 1.24);
      const big = (land ? 64 : 88) * u; const tty = wcy + wh / 2 + 44 * u;
      ctx.save(); ctx.font = font(500, big, F.m); ctx.fillStyle = BONE; ctx.textBaseline = 'alphabetic';
      const cur = fmt(S.el); ctx.fillText(cur, wx, tty + big * 0.8); const cw = ctx.measureText(cur).width;
      ctx.font = font(400, big * 0.4, F.m); ctx.fillStyle = BONE_SUB; ctx.fillText(' / ' + fmt(S.dur), wx + cw, tty + big * 0.8); ctx.restore();
      drawLyrics(S, { x: wx, y: tty + big + 50 * u, w: ww, align: 'left', size: (land ? 50 : 58) * u, color: BONE, nextColor: BONE_SUB });
    }
  },

  poster: {
    name: 'Poster', blurb: 'print layout',
    draw(S) {
      const { ctx, W, H, u } = S; const paper = mix({ r: 240, g: 236, b: 228 }, S.color, .1); const ink = '#141414';
      ctx.fillStyle = rgba(paper, 1); ctx.fillRect(0, 0, W, H); grain(S, .14);
      const m = W * 0.075, top = safeTop(S), tall = H / W >= 1.2;
      ctx.save(); ctx.font = font(600, 22 * u, F.m); ctx.fillStyle = ink; ctx.textBaseline = 'top';
      ctx.fillText('SIDE A', m, top); ctx.textAlign = 'right'; ctx.fillText(fmt(S.el) + ' / ' + fmt(S.dur), W - m, top); ctx.restore();
      const prog = (x, y, w) => {
        ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(x, y, w, 3 * u); ctx.fillStyle = ink; ctx.fillRect(x, y, w * S.p, 3 * u);
        ctx.fillStyle = S.accent; ctx.beginPath(); ctx.arc(x + w * S.p, y + 1.5 * u, 9 * u, 0, Math.PI * 2); ctx.fill();
      };
      const lyr = { color: ink, dim: 'rgba(20,20,20,.22)', nextColor: 'rgba(20,20,20,.6)', fam: F.s, weight: 400, lh: 1.04 };
      let y = top + 50 * u;
      if (tall) {
        const rw = H / W > 1.5 ? W - m - W * 0.12 : W - 2 * m;
        const cs = Math.min(rw, H * 0.36); coverSq(S, m, y, cs, 0, true); y += cs + 34 * u;
        ctx.save(); ctx.fillStyle = ink; ctx.textBaseline = 'top'; const T = S.title.toUpperCase();
        const ts = fitSize(ctx, T, 800, 150 * u, rw); ctx.fillText(T, m - ts * 0.02, y); y += ts * 0.95;
        ctx.font = font('italic 400', 52 * u, F.s); ctx.fillText(ellip(ctx, S.artist, rw), m, y + 4 * u); ctx.restore(); y += 84 * u;
        if (S.showProgress) { prog(m, y, rw); y += 46 * u; }
        drawLyrics(S, { ...lyr, x: m, y, w: rw, align: 'left', size: 64 * u });
      } else {
        const cs = Math.min(H * 0.52, W * 0.4); coverSq(S, m, y, cs, 0, true);
        const tx = m + cs + m * 0.6, tw = W - tx - m;
        ctx.save(); ctx.fillStyle = ink; ctx.textBaseline = 'top'; const T = S.title.toUpperCase();
        let ts = 120 * u, tl;
        for (;;) { ctx.font = font(800, ts); tl = wrapWords(ctx, T, tw); const ok = tl.length <= 3 && tl.length * ts * 0.92 <= cs * 0.62 && tl.every(l => ctx.measureText(l.join(' ')).width <= tw); if (ok || ts < 28 * u) break; ts *= 0.93; }
        tl.forEach((l, i) => ctx.fillText(l.join(' '), tx, y - ts * 0.08 + i * ts * 0.92));
        ctx.font = font('italic 400', 48 * u, F.s); ctx.fillText(ellip(ctx, S.artist, tw), tx, y + tl.length * ts * 0.92 + 8 * u); ctx.restore();
        if (S.showProgress) prog(tx, y + cs - 3 * u, tw);
        drawLyrics(S, { ...lyr, x: m, y: y + cs + 46 * u, w: W - 2 * m, align: 'left', size: 58 * u });
      }
    }
  },

  vhs: {
    name: 'VHS', blurb: 'tape, scanlines',
    draw(S) {
      const { ctx, W, H, u } = S; const bg = retroBg(S, W, H);
      ctx.drawImage(bg, 0, 0);
      const seed = Math.floor(S.t * 12);
      for (let k = 0; k < 3; k++) {
        const by = rand(seed * 3 + k) * H, bh = (8 + rand(seed + k * 7) * 40) * u, off = (rand(seed * 5 + k) - 0.5) * 18 * u;
        ctx.drawImage(bg, 0, by, W, bh, off, by, W, bh);
      }
      ctx.fillStyle = 'rgba(10,0,20,.3)'; ctx.fillRect(0, 0, W, H);
      const ty = ((S.t * 0.18) % 1.3 - 0.15) * H; const tg = ctx.createLinearGradient(0, ty, 0, ty + 60 * u);
      tg.addColorStop(0, 'rgba(255,255,255,0)'); tg.addColorStop(.5, 'rgba(255,255,255,.1)'); tg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = tg; ctx.fillRect(0, ty, W, 60 * u);
      scanlines(S); grain(S, .16); vignette(S, .65);
      const m = W * 0.07, top = safeTop(S), ch = 3 * u; const vt = { chroma: ch };
      ctx.save(); ctx.textBaseline = 'top'; ctx.font = font(400, 78 * u, F.v);
      txt(ctx, 'PLAY', m, top, '#fff', vt); const pw = ctx.measureText('PLAY ').width;
      ctx.fillStyle = '#fff'; tri(ctx, m + pw, top + 36 * u, 44 * u);
      ctx.textAlign = 'right'; txt(ctx, 'SP', W - m, top, '#fff', vt); ctx.restore();
      const by = H - (H / W > 1.5 ? H * 0.2 : H * 0.09);
      ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.font = font(400, 44 * u, F.v);
      const d = new Date(); const ds = d.toLocaleString('en-US', { month: 'short' }).toUpperCase() + '.' + String(d.getDate()).padStart(2, '0') + ' ' + d.getFullYear();
      txt(ctx, ds, m, by - 70 * u, '#fff', vt); ctx.font = font(400, 68 * u, F.v);
      const e = Math.floor(S.el); txt(ctx, `00:${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`, m, by, '#fff', vt);
      if (S.showProgress) { const n = 20, sw = 18 * u, gap = 6 * u; for (let i = 0; i < n; i++) { ctx.fillStyle = i / n < S.p ? '#fff' : 'rgba(255,255,255,.25)'; ctx.fillRect(W - m - (n - i) * (sw + gap) + gap, by - 30 * u, sw, 30 * u); } }
      ctx.restore();
      const cyT = H / W > 1.5 ? H * 0.42 : H * 0.36;
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; const T = S.title.toUpperCase();
      fitSize(ctx, T, 400, 150 * u, W - 2 * m, F.v); txt(ctx, T, W / 2, cyT, '#fff', { chroma: ch * 1.6 });
      ctx.font = font(400, 56 * u, F.v); txt(ctx, ellip(ctx, S.artist.toUpperCase(), W - 2 * m), W / 2, cyT + 70 * u, 'rgba(255,255,255,.85)', vt); ctx.restore();
      drawLyrics(S, { x: m, y: cyT + 190 * u, w: W - 2 * m, align: 'center', size: 66 * u, color: '#ffe45c', dim: 'rgba(255,228,92,.35)', fam: F.v, weight: 400, box: 'rgba(0,0,0,.72)', showNext: false, lh: 1.25 });
    }
  }
};

function render(ctx, W, H, D) {
  const S = Object.assign({}, D, { ctx, W, H, u: Math.min(W, H) / 1000 });
  S.dur = Math.max(0.01, D.end - D.start); S.el = clamp(D.t - D.start, 0, S.dur); S.p = S.el / S.dur;
  ctx.save(); ctx.clearRect(0, 0, W, H); (STYLES[D.style] || STYLES.record).draw(S); ctx.restore();
}

/* =========================================================
   COVER + COLOR
   ========================================================= */
function makeDefaultCover(accent, label = 'Your Track', bg = '#16151a', fg = '#f1eee8') {
  const c = mk(1000, 1000), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 1000, 1000);
  x.fillStyle = accent; x.beginPath(); x.arc(660, 640, 420, 0, Math.PI * 2); x.fill();
  x.strokeStyle = bg; x.globalAlpha = .18; x.lineWidth = 4;
  for (let r = 180; r < 420; r += 34) { x.beginPath(); x.arc(660, 640, r, 0, Math.PI * 2); x.stroke(); }
  x.globalAlpha = 1; x.fillStyle = bg; x.beginPath(); x.arc(660, 640, 120, 0, Math.PI * 2); x.fill();
  x.fillStyle = accent; x.beginPath(); x.arc(660, 640, 16, 0, Math.PI * 2); x.fill();
  return c;
}
function dominant(img) {
  const t = mk(24, 24), x = t.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
  const d = x.getImageData(0, 0, 24, 24).data; let R = 0, G = 0, B = 0, Wt = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0; const w = 0.04 + sat * sat * (mx / 255);
    R += r * w; G += g * w; B += b * w; Wt += w;
  }
  return { r: R / Wt, g: G / Wt, b: B / Wt };
}
function vivid(c) {
  const mx = Math.max(c.r, c.g, c.b, 1); let o = { r: c.r * 255 / mx, g: c.g * 255 / mx, b: c.b * 255 / mx };
  const gr = (o.r + o.g + o.b) / 3; o = { r: gr + (o.r - gr) * 1.4, g: gr + (o.g - gr) * 1.4, b: gr + (o.b - gr) * 1.4 };
  return { r: clamp(o.r, 0, 255), g: clamp(o.g, 0, 255), b: clamp(o.b, 0, 255) };
}

/* ---------- ID3 tags ---------- */
function parseID3(buf) {
  try {
    const v = new DataView(buf); const out = {};
    if (buf.byteLength < 10 || String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2)) !== 'ID3') return out;
    const ver = v.getUint8(3); if (ver < 3) return out;
    const ss = o => (v.getUint8(o) << 21) | (v.getUint8(o + 1) << 14) | (v.getUint8(o + 2) << 7) | v.getUint8(o + 3);
    const size = ss(6); let off = 10; const end = Math.min(buf.byteLength, 10 + size);
    if (v.getUint8(5) & 0x40) off += ver === 4 ? ss(10) : v.getUint32(10) + 4;
    const dec = (bytes, enc) => {
      const lbl = enc === 0 ? 'latin1' : enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : 'utf-8';
      return new TextDecoder(lbl).decode(bytes).replace(/\0+$/g, '').replace(/^﻿/, '').split('\0')[0].trim();
    };
    while (off + 10 < end) {
      const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fs = ver === 4 ? ss(off + 4) : v.getUint32(off + 4); if (fs <= 0 || off + 10 + fs > end) break;
      const data = new Uint8Array(buf, off + 10, fs);
      if (id === 'TIT2') out.title = dec(data.subarray(1), data[0]);
      else if (id === 'TPE1') out.artist = dec(data.subarray(1), data[0]);
      else if (id === 'APIC' && !out.pic) {
        const enc = data[0]; let i = 1; let mime = '';
        while (i < data.length && data[i] !== 0) mime += String.fromCharCode(data[i++]); i++; i++;
        if (enc === 1 || enc === 2) { while (i + 1 < data.length && !(data[i] === 0 && data[i + 1] === 0)) i += 2; i += 2; }
        else { while (i < data.length && data[i] !== 0) i++; i++; }
        if (!mime || mime === '-->') mime = 'image/jpeg'; if (!mime.includes('/')) mime = 'image/' + mime.toLowerCase();
        out.pic = new Blob([data.slice(i)], { type: mime });
      }
      off += 10 + fs;
    }
    return out;
  } catch (e) { return {}; }
}

/* =========================================================
   APP STATE
   ========================================================= */
const DEMO_DUR = 15;
const DEMO_LINES = [
  { t: 0.4, text: 'drop your mp3 to make this yours' },
  { t: 4.0, text: 'pick a frame for stories or posts' },
  { t: 7.6, text: 'tap along to sync your lyrics' },
  { t: 11.2, text: 'then export it and post it anywhere' }
];
const state = {
  style: 'record', ratio: '9:16', custom: [3, 4], title: 'Your Track', artist: 'You', accent: '#ff4d2e',
  lyricStyle: 'fade', showProgress: true, loop: true, guides: true,
  start: 0, end: DEMO_DUR, duration: 0, lines: DEMO_LINES.map(l => ({ ...l })), demoLyrics: true,
  cover: null, coverIsDefault: true, color: { r: 255, g: 90, b: 54 }, peaks: null, fileName: null
};
let hasAudio = false, timed = [];
const audio = new Audio(); audio.preload = 'auto';
let actx, srcNode, analyser, speaker, recDest, freq;
const LV = new Float32Array(128); let BASS = 0;

function ensureGraph() {
  if (actx) return;
  const AC = window.AudioContext || window.webkitAudioContext; actx = new AC();
  srcNode = actx.createMediaElementSource(audio); analyser = actx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.78;
  speaker = actx.createGain(); recDest = actx.createMediaStreamDestination();
  srcNode.connect(analyser); analyser.connect(speaker); speaker.connect(actx.destination); srcNode.connect(recDest);
  freq = new Uint8Array(analyser.frequencyBinCount);
}
function refreshTimed() { timed = state.lines.filter(l => l.t != null && l.text.trim()).sort((a, b) => a.t - b.t); }
refreshTimed();

const stage = $('#stage'), sctx = stage.getContext('2d');
const toastEl = $('#toast'); let toastT;
function toast(msg, ms = 2600) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), ms); }

function data(now, overrides = {}) {
  const t = hasAudio ? audio.currentTime : (now / 1000) % DEMO_DUR;
  return Object.assign({
    style: state.style, cover: state.cover, title: state.title || 'Untitled', artist: state.artist || '', accent: state.accent, color: state.color,
    lyricStyle: state.lyricStyle, showProgress: state.showProgress, lyrics: timed,
    start: hasAudio ? state.start : 0, end: hasAudio ? state.end : DEMO_DUR, t, levels: LV, bass: BASS,
    playing: hasAudio ? !audio.paused : true, peaks: state.peaks
  }, overrides);
}

/* ---------- sizing ---------- */
function ratioPair() {
  let [a, b] = state.ratio === 'custom' ? state.custom : state.ratio.split(':').map(Number);
  a = clamp(+a || 1, 1, 30); b = clamp(+b || 1, 1, 30);
  if (a / b > 3) a = b * 3; if (b / a > 3) b = a * 3; return [a, b];
}
function ratioWH() {
  const [a, b] = ratioPair(); let W, H;
  if (a <= b) { W = 1080; H = 1080 * b / a; } else { H = 1080; W = 1080 * a / b; }
  const mx = Math.max(W, H); if (mx > 1920) { W *= 1920 / mx; H *= 1920 / mx; }
  return [Math.round(W / 2) * 2, Math.round(H / 2) * 2];
}
function fitStage() {
  const col = $('#stageCol'); const cw = col.clientWidth; const mh = Math.min(window.innerHeight * 0.7, 820);
  const [W, H] = [stage.width, stage.height]; let w = cw, h = cw * H / W; if (h > mh) { h = mh; w = h * W / H; }
  const wrap = $('#stageWrap'); wrap.style.width = Math.round(w) + 'px'; wrap.style.height = Math.round(h) + 'px';
}
let snap = null, snapAt = 0;
function takeSnap() { if (exporting) return; const c = mk(stage.width, stage.height); c.getContext('2d').drawImage(stage, 0, 0); snap = c; snapAt = performance.now(); }
function applyRatio() {
  takeSnap();
  const [W, H] = ratioWH(); stage.width = W; stage.height = H; if (snap) { const c = mk(W, H); drawCover(c.getContext('2d'), snap, 0, 0, W, H); snap = c; }
  fitStage(); $('#guides').classList.toggle('on', state.guides && H / W >= 1.7);
  $('#guidesBtn').disabled = H / W < 1.7; $('#guidesBtn').title = H / W < 1.7 ? 'Safe zones apply to tall 9:16 videos' : 'Show where Instagram/TikTok UI covers your video';
  queueThumbs();
}

/* ---------- style thumbnails ---------- */
const stylesEl = $('#styles');
Object.entries(STYLES).forEach(([k, s]) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'style-btn'; b.dataset.style = k;
  b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', k === state.style);
  b.innerHTML = `<div class="thumb"><canvas></canvas></div><span>${s.name}</span>`;
  b.addEventListener('click', () => setStyle(k)); stylesEl.appendChild(b);
});
let thumbQ;
function queueThumbs() { clearTimeout(thumbQ); thumbQ = setTimeout(renderThumbs, 120); }
function renderThumbs() {
  if (!state.cover) return;
  const [W, H] = ratioWH(); const sc = Math.min(200 / W, 250 / H); const tw = Math.round(W * sc), th = Math.round(H * sc);
  const first = timed[0]; const t = first ? first.t + 1.5 : (hasAudio ? state.start + (state.end - state.start) * 0.4 : 1.9);
  const lv = new Float32Array(128).map((_, i) => 0.35 + 0.35 * Math.abs(Math.sin(i * 0.5)));
  $$('.style-btn', stylesEl).forEach(b => {
    const c = $('canvas', b); c.width = tw; c.height = th;
    c.style.aspectRatio = `${tw}/${th}`;
    render(c.getContext('2d'), tw, th, data(performance.now(), { style: b.dataset.style, t, levels: lv, bass: 0.3, lyricStyle: 'fade', playing: true }));
  });
}
function setStyle(k) {
  if (k === state.style) return; takeSnap(); state.style = k;
  $$('.style-btn', stylesEl).forEach(b => b.setAttribute('aria-checked', b.dataset.style === k));
}

/* ---------- cover handling ---------- */
function drawCoverThumb() { const c = $('#coverThumb'); drawCover(c.getContext('2d'), state.cover, 0, 0, c.width, c.height); }
function coverChanged() { drawCoverThumb(); queueThumbs(); }
function useDefaultCover() { state.cover = makeDefaultCover(state.accent, state.title || 'Your Track'); state.coverIsDefault = true; state.color = dominant(state.cover); coverChanged(); }
async function setCover(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const sc = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = mk(img.naturalWidth * sc, img.naturalHeight * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    takeSnap(); state.cover = c; state.coverIsDefault = false; state.color = dominant(c); coverChanged(); return true;
  } catch (e) { toast('Couldn’t read that image'); return false; }
  finally { URL.revokeObjectURL(url); }
}

/* ---------- audio loading ---------- */
async function loadAudio(file) {
  if (!file) return;
  if (!/^audio\//.test(file.type) && !/\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(file.name)) { toast('That doesn’t look like an audio file'); return; }
  ensureGraph();
  if (state.audioURL) URL.revokeObjectURL(state.audioURL);
  state.audioURL = URL.createObjectURL(file); audio.src = state.audioURL; state.fileName = file.name;
  const buf = await file.arrayBuffer(); const tags = parseID3(buf);
  state.title = tags.title || file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '); if (tags.artist) state.artist = tags.artist;
  $('#title').value = state.title; $('#artist').value = state.artist;
  let gotCover = false; if (tags.pic) gotCover = await setCover(tags.pic);
  if (state.demoLyrics) { state.lines = []; state.demoLyrics = false; $('#lyricsText').value = ''; refreshTimed(); renderRows(); }
  await new Promise((res, rej) => {
    if (audio.readyState >= 1) return res();
    audio.addEventListener('loadedmetadata', res, { once: true }); audio.addEventListener('error', rej, { once: true });
  }).catch(() => { toast('Your browser can’t play that file. Try an mp3.'); throw new Error('decode'); });
  hasAudio = true; state.duration = audio.duration; state.start = 0; state.end = Math.min(audio.duration, 30); state.peaks = null;
  audio.currentTime = 0;
  $('#drop').classList.add('loaded'); $('#dropTitle').textContent = file.name; $('#dropSub').textContent = `${fmt(audio.duration)} · click to swap`;
  $('#demoBadge').classList.add('hide');
  updateTrimInputs(); queueThumbs();
  toast(gotCover ? 'Loaded. Found cover art in your tags' : 'Loaded. Add cover art to make it pop');
  const st = $('#studio').getBoundingClientRect(); if (st.top > window.innerHeight * 0.5 || st.bottom < 0) $('#studio').scrollIntoView({ behavior: 'smooth' });
  try {
    const ab = await actx.decodeAudioData(buf.slice(0)); const ch = ab.getChannelData(0); const P = 3000, step = Math.floor(ch.length / P) || 1;
    const out = new Float32Array(P);
    for (let i = 0; i < P; i++) { let m = 0; const s = i * step; for (let j = 0; j < step; j += 4) { const v = Math.abs(ch[s + j] || 0); if (v > m) m = v; } out[i] = m; }
    state.peaks = { data: out, dur: ab.duration }; queueThumbs();
  } catch (e) { /* waveform stays synthetic */ }
}

/* ---------- transport ---------- */
const playBtn = $('#playBtn');
function togglePlay() {
  if (!hasAudio) { flashDrop(); toast('Drop an mp3 first'); return; }
  ensureGraph(); actx.resume();
  if (audio.paused) { if (audio.currentTime < state.start || audio.currentTime >= state.end - 0.05) audio.currentTime = state.start; audio.play(); }
  else audio.pause();
}
audio.addEventListener('play', () => { playBtn.classList.add('playing'); playBtn.setAttribute('aria-label', 'Pause'); });
audio.addEventListener('pause', () => { playBtn.classList.remove('playing'); playBtn.setAttribute('aria-label', 'Play'); });
playBtn.addEventListener('click', togglePlay);
function flashDrop() { const d = $('#drop'); d.classList.remove('flash'); void d.offsetWidth; d.classList.add('flash'); }

/* ---------- trim ---------- */
const trimC = $('#trim'), tctx = trimC.getContext('2d');
function trimDur() { return hasAudio ? state.duration : DEMO_DUR; }
let TC = null; function themeColors() { const cs = getComputedStyle(document.documentElement); TC = { ink: cs.getPropertyValue('--ink').trim() || '#f1eee8', mute: cs.getPropertyValue('--line-2').trim() }; }
function drawTrim(now) {
  if (!TC) themeColors();
  const dpr = window.devicePixelRatio || 1; const w = trimC.clientWidth, h = trimC.clientHeight; if (!w) return;
  if (trimC.width !== Math.round(w * dpr)) { trimC.width = Math.round(w * dpr); trimC.height = Math.round(h * dpr); }
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.clearRect(0, 0, w, h);
  const D = trimDur(), s = hasAudio ? state.start : 0, e = hasAudio ? state.end : DEMO_DUR;
  const sx = s / D * w, ex = e / D * w; const N = Math.floor(w / 4);
  let pk;
  if (state.peaks) pk = snippetPeaks({ peaks: state.peaks, start: 0, end: state.duration }, N); else pk = demoPeaks(N);
  for (let i = 0; i < N; i++) {
    const x = i * 4 + 1, inside = x >= sx && x <= ex, v = Math.max(0.06, pk[i]) * (h - 16);
    tctx.fillStyle = inside ? TC.ink : TC.mute; tctx.fillRect(x, (h - v) / 2, 2, v);
  }
  tctx.fillStyle = rgba(hexToRgb('#ff4d2e'), .12); tctx.fillRect(sx, 0, ex - sx, h);
  [sx, ex].forEach(x => { tctx.fillStyle = '#ff4d2e'; tctx.fillRect(x - 2, 0, 4, h); rr(tctx, x - 6, h / 2 - 14, 12, 28, 6); tctx.fill(); });
  const t = hasAudio ? audio.currentTime : (now / 1000) % DEMO_DUR; const px = t / D * w;
  tctx.fillStyle = TC.ink; tctx.fillRect(px - 1, 0, 2, h);
}
let drag = null;
trimC.addEventListener('pointerdown', e => {
  if (!hasAudio) { flashDrop(); toast('Drop an mp3 to trim it'); return; }
  const r = trimC.getBoundingClientRect(), x = e.clientX - r.left, D = state.duration;
  const sx = state.start / D * r.width, ex = state.end / D * r.width; const tAt = clamp(x / r.width * D, 0, D);
  const mode = Math.abs(x - sx) < 14 ? 's' : Math.abs(x - ex) < 14 ? 'e' : (x > sx && x < ex ? 'move' : 'jump');
  if (mode === 'jump') { const len = state.end - state.start; state.start = clamp(tAt, 0, Math.max(0, D - len)); state.end = state.start + len; audio.currentTime = state.start; updateTrimInputs(); }
  drag = { mode, x0: x, s0: state.start, e0: state.end, moved: false, tAt }; trimC.setPointerCapture(e.pointerId);
});
trimC.addEventListener('pointermove', e => {
  if (!drag) return; const r = trimC.getBoundingClientRect(), x = e.clientX - r.left, D = state.duration; const t = clamp(x / r.width * D, 0, D);
  if (Math.abs(x - drag.x0) > 3) drag.moved = true; if (!drag.moved) return;
  if (drag.mode === 's') state.start = clamp(t, 0, state.end - 1);
  else if (drag.mode === 'e') state.end = clamp(t, state.start + 1, D);
  else if (drag.mode === 'move') { const len = drag.e0 - drag.s0; const d = (x - drag.x0) / r.width * D; state.start = clamp(drag.s0 + d, 0, D - len); state.end = state.start + len; }
  if (audio.currentTime < state.start || audio.currentTime > state.end) audio.currentTime = state.start;
  updateTrimInputs();
});
const endDrag = () => {
  if (!drag) return;
  if (!drag.moved && drag.mode === 'move') audio.currentTime = drag.tAt;
  if (drag.moved && drag.mode === 's') audio.currentTime = state.start;
  drag = null; queueThumbs();
};
trimC.addEventListener('pointerup', endDrag); trimC.addEventListener('pointercancel', endDrag);
function updateTrimInputs() {
  $('#startIn').value = fmtP(hasAudio ? state.start : 0); $('#endIn').value = fmtP(hasAudio ? state.end : DEMO_DUR);
  const len = (hasAudio ? state.end - state.start : DEMO_DUR); $('#lenOut').textContent = len.toFixed(1) + 's';
  $('#timeDur').textContent = fmt(len);
}
$('#startIn').addEventListener('change', e => { const t = parseT(e.target.value); if (hasAudio && t != null) { state.start = clamp(t, 0, state.end - 1); audio.currentTime = state.start; } updateTrimInputs(); });
$('#endIn').addEventListener('change', e => { const t = parseT(e.target.value); if (hasAudio && t != null) state.end = clamp(t, state.start + 1, state.duration); updateTrimInputs(); });
$$('.quick button').forEach(b => b.addEventListener('click', () => {
  if (!hasAudio) { flashDrop(); toast('Drop an mp3 first'); return; }
  const L = +b.dataset.len; state.end = Math.min(state.duration, state.start + L); if (state.end - state.start < L) state.start = Math.max(0, state.end - L);
  audio.currentTime = state.start; updateTrimInputs();
}));

/* ---------- lyrics UI ---------- */
const rowsEl = $('#lyricRows'); let activeRow = -1;
function renderRows() {
  rowsEl.innerHTML = '';
  state.lines.forEach((l, i) => {
    const row = document.createElement('div'); row.className = 'row'; row.dataset.i = i;
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = l.t != null ? fmtP(l.t) : ''; inp.placeholder = '--:--'; inp.className = l.t == null ? 'unset' : '';
    inp.setAttribute('aria-label', `Time for line ${i + 1}`);
    inp.addEventListener('change', () => { const t = parseT(inp.value); l.t = t; inp.value = t != null ? fmtP(t) : ''; inp.className = t == null ? 'unset' : ''; refreshTimed(); queueThumbs(); });
    const tx = document.createElement('span'); tx.className = 'txt'; tx.textContent = l.text; tx.title = 'Jump here';
    tx.addEventListener('click', () => { if (hasAudio && l.t != null) { audio.currentTime = l.t; if (l.t < state.start || l.t > state.end) toast('That line is outside your snippet'); } });
    const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = '⏱'; bt.title = 'Set to current time'; bt.setAttribute('aria-label', `Set line ${i + 1} to current time`);
    bt.addEventListener('click', () => { if (!hasAudio) { flashDrop(); return; } l.t = audio.currentTime; renderRows(); refreshTimed(); });
    row.append(inp, tx, bt); rowsEl.appendChild(row);
  });
  activeRow = -1;
}
function linesFromText() {
  const raw = $('#lyricsText').value.split('\n').map(s => s.trim()).filter(Boolean); const old = state.lines;
  state.lines = raw.map((text, i) => ({ text, t: old[i] ? old[i].t : null })); state.demoLyrics = false;
  refreshTimed(); renderRows(); queueThumbs();
}
let lyrT; $('#lyricsText').addEventListener('input', () => { clearTimeout(lyrT); lyrT = setTimeout(linesFromText, 250); });
$('#lyricsText').value = state.lines.map(l => l.text).join('\n'); renderRows();

$('#clearTimes').addEventListener('click', () => { state.lines.forEach(l => l.t = null); refreshTimed(); renderRows(); toast('Timestamps cleared'); });
$('#exportLrc').addEventListener('click', () => {
  if (!timed.length) { toast('Sync some lines first'); return; }
  const out = state.lines.filter(l => l.t != null).sort((a, b) => a.t - b.t).map(l => { const m = Math.floor(l.t / 60); return `[${String(m).padStart(2, '0')}:${(l.t - m * 60).toFixed(2).padStart(5, '0')}]${l.text}`; });
  const head = [`[ti:${state.title}]`, `[ar:${state.artist}]`];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([head.concat(out).join('\n')], { type: 'text/plain' })); a.download = slug(state.title) + '.lrc'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
$('#lrcInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return; const txt = await f.text(); const lines = [];
  txt.split(/\r?\n/).forEach(row => {
    const tags = [...row.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)]; const text = row.replace(/\[[^\]]*\]/g, '').trim();
    if (!tags.length) return; tags.forEach(m => lines.push({ t: +m[1] * 60 + parseFloat(m[2].replace(':', '.')), text }));
  });
  if (!lines.length) { toast('No timestamps found in that file'); return; }
  lines.sort((a, b) => a.t - b.t); state.lines = lines.filter(l => l.text); state.demoLyrics = false;
  $('#lyricsText').value = state.lines.map(l => l.text).join('\n'); refreshTimed(); renderRows(); queueThumbs();
  toast(`Imported ${state.lines.length} synced lines`); e.target.value = '';
});

/* tap sync */
let sync = null; const syncPanel = $('#syncPanel');
function updateSyncPanel() { if (!sync) return; const L = state.lines; $('#syncNow').textContent = L[sync.i] ? L[sync.i].text : ''; $('#syncNext').textContent = L[sync.i + 1] ? 'next: ' + L[sync.i + 1].text : 'last line'; }
function startSync() {
  if (!hasAudio) { flashDrop(); toast('Drop an mp3 first, then tap along'); return; }
  if (state.demoLyrics || !state.lines.length) { toast('Paste your lyrics first, one line per row'); $('#lyricsText').focus(); return; }
  ensureGraph(); actx.resume(); state.lines.forEach(l => l.t = null); refreshTimed(); renderRows();
  sync = { i: 0 }; syncPanel.hidden = false; updateSyncPanel(); audio.currentTime = state.start; audio.play();
  syncPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function tap() {
  if (!sync) return; const b = $('#tapHit'); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
  state.lines[sync.i].t = audio.currentTime; sync.i++; refreshTimed(); renderRows();
  if (sync.i >= state.lines.length) endSync(true); else updateSyncPanel();
}
function endSync(done) { sync = null; syncPanel.hidden = true; queueThumbs(); toast(done ? 'Synced! Hit play to watch it back' : 'Sync stopped. You can still edit times by hand'); }
$('#tapBtn').addEventListener('click', startSync); $('#tapHit').addEventListener('click', tap);
$('#syncStop').addEventListener('click', () => { audio.pause(); endSync(false); });
$('#syncUndo').addEventListener('click', () => {
  if (!sync || sync.i === 0) return; sync.i--; const prev = state.lines[sync.i].t; state.lines[sync.i].t = null;
  audio.currentTime = Math.max(0, (prev || audio.currentTime) - 2); refreshTimed(); renderRows(); updateSyncPanel();
});

/* ---------- controls ---------- */
let coverT; $('#title').addEventListener('input', e => { state.title = e.target.value; if (state.coverIsDefault) { clearTimeout(coverT); coverT = setTimeout(() => { state.cover = makeDefaultCover(state.accent, state.title || 'Your Track'); drawCoverThumb(); }, 200); } queueThumbs(); });
$('#artist').addEventListener('input', e => { state.artist = e.target.value; queueThumbs(); });
$$('#ratios button').forEach(b => b.addEventListener('click', () => {
  state.ratio = b.dataset.ratio; $$('#ratios button').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('#customBox').hidden = state.ratio !== 'custom'; applyRatio();
}));
['#customW', '#customH'].forEach(id => $(id).addEventListener('input', () => { state.custom = [+$('#customW').value || 1, +$('#customH').value || 1]; applyRatio(); }));
function setAccent(hex, fromPicker) {
  state.accent = hex; document.documentElement.style.setProperty('--accent', hex);
  $$('#swatches [data-c]').forEach(b => b.setAttribute('aria-pressed', b.dataset.c.toLowerCase() === hex.toLowerCase()));
  if (!fromPicker) $('#accent').value = hex;
  if (state.coverIsDefault) { state.cover = makeDefaultCover(hex, state.title || 'Your Track'); state.color = dominant(state.cover); drawCoverThumb(); }
  queueThumbs();
}
$$('#swatches [data-c]').forEach(b => b.addEventListener('click', () => setAccent(b.dataset.c)));
$('#accent').addEventListener('input', e => setAccent(e.target.value, true));
$('#matchCover').addEventListener('click', () => { if (state.coverIsDefault) { toast('Add cover art first'); return; } setAccent(rgbToHex(vivid(state.color))); toast('Accent matched to your cover'); });
$$('#lyricStyle button').forEach(b => b.addEventListener('click', () => { state.lyricStyle = b.dataset.ls; $$('#lyricStyle button').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
$('#showProgress').addEventListener('change', e => { state.showProgress = e.target.checked; queueThumbs(); });
$('#loopBtn').addEventListener('click', e => { state.loop = !state.loop; e.currentTarget.setAttribute('aria-pressed', state.loop); });
$('#guidesBtn').addEventListener('click', e => { state.guides = !state.guides; e.currentTarget.setAttribute('aria-pressed', state.guides); applyRatio(); });
$('#audioInput').addEventListener('change', e => { loadAudio(e.target.files[0]).catch(() => { }); e.target.value = ''; });
$('#coverInput').addEventListener('change', async e => { const f = e.target.files[0]; if (f) { if (await setCover(f)) toast('Cover updated'); } e.target.value = ''; });
$('#coverReset').addEventListener('click', () => { takeSnap(); useDefaultCover(); });

/* drag & drop anywhere */
let dragDepth = 0;
window.addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', async e => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
  for (const f of e.dataTransfer.files) {
    if (/^image\//.test(f.type)) { if (await setCover(f)) toast('Cover updated'); }
    else if (/\.lrc$/i.test(f.name)) { const dt = new DataTransfer(); dt.items.add(f); $('#lrcInput').files = dt.files; $('#lrcInput').dispatchEvent(new Event('change')); }
    else loadAudio(f).catch(() => { });
  }
});

/* keyboard */
window.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea') return;
  if (sync && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); tap(); return; }
  if (e.code === 'Space' && hasAudio && !exporting && tag !== 'button') { e.preventDefault(); togglePlay(); }
});

/* =========================================================
   EXPORT
   ========================================================= */
let exporting = null; const modal = $('#exportModal');
function pickMime() {
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return window.MediaRecorder ? types.find(t => MediaRecorder.isTypeSupported(t)) : null;
}
(function () { const m = pickMime(); $('#exportNote').textContent = m ? `Records in real time at 30fps → ${m.includes('mp4') ? 'MP4' : 'WebM'} (${ratioWH().join('×')}).` : 'Your browser can’t record video. Try Chrome or Safari.'; })();
async function startExport() {
  if (!hasAudio) { flashDrop(); toast('Add an mp3 first. The demo is just for vibes'); return; }
  const mime = pickMime(); if (!mime) { toast('Your browser can’t record video. Try Chrome or Safari.'); return; }
  if (sync) endSync(false);
  ensureGraph(); await actx.resume();
  const vs = stage.captureStream(30); const stream = new MediaStream([...vs.getVideoTracks(), ...recDest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 192_000 });
  const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  audio.pause(); audio.currentTime = state.start;
  await new Promise(r => { const f = () => r(); audio.addEventListener('seeked', f, { once: true }); setTimeout(f, 600); });
  exporting = { rec, chunks, mime, vs, cancelled: false };
  modal.hidden = false; $('#exportTitle').textContent = 'Recording your video…'; $('#exportMsg').textContent = 'Keep this tab open and visible. It records in real time.';
  $('#exportCancel').hidden = false; $('#downloadLink').hidden = true; $('#exportClose').hidden = true; setRing(0);
  speaker.gain.value = $('#muteExport').checked ? 0 : 1;
  rec.onstop = () => {
    const ex = exporting; exporting = null; speaker.gain.value = 1; ex.vs.getTracks().forEach(t => t.stop());
    if (ex.cancelled) { modal.hidden = true; toast('Export cancelled'); return; }
    const blob = new Blob(ex.chunks, { type: ex.mime.split(';')[0] }); const ext = ex.mime.includes('mp4') ? 'mp4' : 'webm';
    const [a, b] = ratioPair(); const a2 = $('#downloadLink'); if (a2.href) URL.revokeObjectURL(a2.href);
    a2.href = URL.createObjectURL(blob); a2.download = `${slug(state.title)}-${a}x${b}.${ext}`; a2.click();
    setRing(1); $('#exportTitle').textContent = 'Your video is ready'; $('#exportMsg').textContent = `${(blob.size / 1048576).toFixed(1)} MB ${ext.toUpperCase()} saved to your downloads.` + (ext === 'webm' ? ' Tip: Safari and new Chrome export MP4 directly.' : '');
    $('#exportCancel').hidden = true; a2.hidden = false; $('#exportClose').hidden = false;
  };
  rec.start(250); await audio.play();
}
function stopExport(cancel) { if (!exporting) return; exporting.cancelled = !!cancel; audio.pause(); if (exporting.rec.state !== 'inactive') exporting.rec.stop(); }
function setRing(p) { $('#exportRing').style.strokeDashoffset = 327 * (1 - p); $('#exportPct').textContent = Math.round(p * 100) + '%'; }
$('#exportBtn').addEventListener('click', startExport);
$('#exportCancel').addEventListener('click', () => stopExport(true));
$('#exportClose').addEventListener('click', () => { modal.hidden = true; });

/* =========================================================
   HERO DEMOS
   ========================================================= */
const DEMO_HERO_LYRICS = [
  { t: 0.3, text: 'windows down, bass up' }, { t: 3.6, text: "this one's for the group chat" },
  { t: 7.2, text: 'hit save before it drops' }, { t: 10.8, text: 'snippet season' }
];
const REEL = [
  { style: 'record', title: 'Midnight Drive', accent: '#ff4d2e', bg: '#16151a', fg: '#f1eee8' },
  { style: 'sleeve', title: 'Corner Store', accent: '#f1eee8', bg: '#2f5bff', fg: '#f1eee8' },
  { style: 'type', title: 'Send It', accent: '#c6f432', bg: '#16151a', fg: '#f1eee8', look: '#c6f432' },
  { style: 'wave', title: 'Late Bus Home', accent: '#ff6fb5', bg: '#16151a', fg: '#f1eee8' },
  { style: 'poster', title: 'Sunday Tape', accent: '#16151a', bg: '#ff4d2e', fg: '#16151a', look: '#ff4d2e' },
  { style: 'vhs', title: 'Tape 03', accent: '#2f5bff', bg: '#f1eee8', fg: '#16151a' }
];
const reelEl = $('#reel');
const heroDemos = REEL.map((d, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'look'; b.style.setProperty('--i', i);
  b.innerHTML = `<canvas width="360" height="640"></canvas><span class="look-name"><b>${STYLES[d.style].name}</b><span>${STYLES[d.style].blurb}</span></span>`;
  b.setAttribute('aria-label', `Open the ${STYLES[d.style].name} look in the studio`);
  b.addEventListener('click', () => { setStyle(d.style); $('#studio').scrollIntoView({ behavior: 'smooth' }); });
  reelEl.appendChild(b); const c = $('canvas', b);
  return { ...d, c, ctx: c.getContext('2d'), cover: null, off: i * 2.3 };
});
function buildHeroCovers() { heroDemos.forEach(d => { d.cover = makeDefaultCover(d.accent === d.bg ? d.fg : d.accent, d.title, d.bg, d.fg); d.color = dominant(d.cover); }); }
let heroVisible = false;
new IntersectionObserver(es => es.forEach(e => { heroVisible = e.isIntersecting; if (e.isIntersecting) $('.looks').classList.add('in'); }), { threshold: 0.15 }).observe($('.looks'));

/* =========================================================
   MAIN LOOP
   ========================================================= */
let lastUI = 0, frameN = 0;
function updateLevels(now) {
  if (hasAudio && !audio.paused && analyser) { analyser.getByteFrequencyData(freq); for (let i = 0; i < LV.length; i++) LV[i] = freq[i] / 255; }
  else {
    const tt = now / 1000;
    for (let i = 0; i < LV.length; i++) {
      const target = hasAudio ? 0.05 : Math.max(0, 0.3 + 0.25 * Math.sin(tt * 2.2 + i * 0.35) * Math.sin(tt * 1.3 + i * 0.11) + 0.2 * Math.max(0, Math.sin(tt * 4.2)) * (i < 12 ? 1 : 0.4));
      LV[i] += (target - LV[i]) * 0.15;
    }
  }
  const b = (LV[2] + LV[3] + LV[4] + LV[5]) / 4; BASS = clamp((b - 0.35) / 0.6, 0, 1);
}
function frame(now) {
  requestAnimationFrame(frame); frameN++;
  if (hasAudio && !audio.paused) {
    if (exporting) { setRing(clamp((audio.currentTime - state.start) / (state.end - state.start), 0, 1)); if (audio.currentTime >= state.end - 0.03 || audio.ended) stopExport(false); }
    else if (audio.currentTime >= state.end || audio.ended) { if (state.loop && !sync) { audio.currentTime = state.start; if (audio.paused) audio.play(); } else { audio.pause(); if (sync) endSync(false); } }
  }
  updateLevels(now);
  if (!state.cover) return;
  render(sctx, stage.width, stage.height, data(now));
  if (snap && !exporting) {
    const k = (now - snapAt) / 380; if (k < 1) { sctx.save(); sctx.globalAlpha = 1 - ease(k); sctx.drawImage(snap, 0, 0, stage.width, stage.height); sctx.restore(); } else snap = null;
  }
  if (now - lastUI > 66) {
    lastUI = now; const D = data(now); $('#timeNow').textContent = fmt(clamp(D.t - D.start, 0, D.end - D.start)); drawTrim(now);
    let ai = -1; if (hasAudio) state.lines.forEach((l, i) => { if (l.t != null && l.t <= audio.currentTime && (ai < 0 || l.t >= state.lines[ai].t)) ai = i; });
    if (ai !== activeRow) { rowsEl.querySelectorAll('.row').forEach(r => r.classList.toggle('active', +r.dataset.i === ai)); activeRow = ai; }
  }
  if (heroVisible && !exporting && frameN % 2 === 0 && heroDemos[0].cover) {
    const lv = LV;
    heroDemos.forEach(d => {
      const t = ((now / 1000) + d.off) % DEMO_DUR;
      render(d.ctx, d.c.width, d.c.height, { style: d.style, cover: d.cover, title: d.title, artist: 'you', accent: d.look || d.accent, color: d.color, lyricStyle: d.style === 'type' ? 'pop' : d.style === 'sleeve' ? 'karaoke' : 'fade', showProgress: true, lyrics: DEMO_HERO_LYRICS, start: 0, end: DEMO_DUR, t, levels: lv, bass: BASS, playing: true, peaks: null });
    });
  }
}

/* reveal on scroll */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
$$('[data-reveal]').forEach(el => io.observe(el));

/* theme + nav */
$('#themeBtn').addEventListener('click', () => {
  const cur = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#f3f1ec' ? 'light' : 'dark';
  const next = cur === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = next; try { localStorage.setItem('wf-theme', next); } catch (e) { }
  setTimeout(themeColors, 350);
});
window.addEventListener('scroll', () => $('.nav').classList.toggle('scrolled', window.scrollY > 8), { passive: true });

/* boot */
new ResizeObserver(fitStage).observe($('#stageCol'));
window.addEventListener('resize', fitStage);
function boot() { useDefaultCover(); buildHeroCovers(); applyRatio(); updateTrimInputs(); setAccent(state.accent); snap = null; }
boot();
Promise.all(['800 40px "Bricolage Grotesque"', '500 20px "Bricolage Grotesque"', '400 20px "VT323"', '400 20px "Geist Mono"', '500 20px "Geist Mono"', '700 20px "Bricolage Grotesque"', 'italic 400 20px "Instrument Serif"', '400 20px "Instrument Serif"']
  .map(f => document.fonts.load(f).catch(() => { }))).then(() => { if (state.coverIsDefault) useDefaultCover(); buildHeroCovers(); queueThumbs(); });
requestAnimationFrame(frame);
