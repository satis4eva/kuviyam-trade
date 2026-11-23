'use strict';
const crypto = require('node:crypto');

/* ---------- safe HTML templating: everything is escaped unless wrapped in raw() ---------- */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(String(s));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderVal(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  return esc(String(v));
}
function h(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += renderVal(vals[i]); });
  return new Raw(out);
}

/* ---------- money and dates ---------- */
const RATE_LKR_PER_GBP = Number(process.env.RATE_LKR_PER_GBP || 385); // example rate for display only
const gbp = (pence) => '£' + (Math.round(pence) / 100).toLocaleString('en-GB', { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 });
const lkr = (n, lang) => (lang === 'ta' ? 'ரூ ' : 'Rs ') + Math.round(n).toLocaleString('en-GB');
const toPence = (v) => { const n = Number(String(v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };

const MON = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], ta: ['ஜன', 'பெப்', 'மார்', 'ஏப்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆக', 'செப்', 'அக்', 'நவ', 'டிச'] };
const monthLabel = (ym, lang) => `${MON[lang] ? MON[lang][+ym.slice(5, 7) - 1] : ym} ${ym.slice(0, 4)}`;
const dateLabel = (iso, lang) => { if (!iso) return ''; const d = String(iso).slice(0, 10); return `${+d.slice(8, 10)} ${MON[lang][+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`; };
const nowIso = () => new Date().toISOString();
const ym = (d) => d.toISOString().slice(0, 7);

/** The month a report is currently required for: reports are due by the 15th of the next month. */
function requiredReportMonth(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - (now.getUTCDate() > 15 ? 1 : 2));
  return ym(d);
}

/* ---------- ids and slugs ---------- */
const token = (bytes = 24) => crypto.randomBytes(bytes).toString('hex');
const ref = (prefix) => `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'partner';

/* ---------- validation helpers ---------- */
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
const clean = (s, max = 500) => String(s ?? '').trim().slice(0, max);
const lines = (s) => String(s || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 20);

module.exports = { Raw, raw, esc, h, gbp, lkr, toPence, MON, monthLabel, dateLabel, nowIso, ym, requiredReportMonth, token, ref, slugify, isEmail, clean, lines, RATE_LKR_PER_GBP };
