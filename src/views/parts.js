'use strict';
const { h, raw, gbp } = require('../util');
const { dt } = require('../i18n');

const L = (row, field, lang) => (lang === 'ta' && row[field + '_ta'] ? row[field + '_ta'] : row[field]);
const initials = (n) => String(n).split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).slice(0, 2).join('');
const color = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#132A4A');
const avatar = (s, lg) => h`<span class="avatar${lg ? ' lg' : ''}" style="background:${raw(color(s.color))}" aria-hidden="true">${initials(s.name)}</span>`;
const csrfField = (ctx) => h`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;
const postBtn = (ctx, action, label, cls = '') => h`<form method="post" action="${action}" class="inline">${csrfField(ctx)}<button class="btn sm ${cls}">${label}</button></form>`;
function options(list, selected, lang, blank) {
  return h`${blank !== undefined ? h`<option value="">${blank}</option>` : ''}${list.map((x) => h`<option value="${x}"${x === selected ? raw(' selected') : ''}>${dt(x, lang)}</option>`)}`;
}
const errors = (ctx, list) => (list && list.length ? h`<div class="flash bad" role="alert"><b>${ctx.t('fixThese')}</b><ul>${list.map((e) => h`<li>${e}</li>`)}</ul></div>` : '');

const ART = {
  Tea: ['#2F7D5B', '#BFE3CF', '<path d="M100 70c0 30 30 54 60 54s60-24 60-54z" fill="#fff"/><path d="M220 80c18 0 24 20 6 30" stroke="#fff" stroke-width="7" fill="none"/><path d="M150 40c-8-10 8-18 0-28M175 40c-8-10 8-18 0-28" stroke="#fff" stroke-width="5" fill="none" opacity=".8"/>'],
  Spices: ['#B5542D', '#F4C4A8', '<rect x="96" y="60" width="128" height="16" rx="8" fill="#fff" transform="rotate(-12 160 68)"/><rect x="96" y="88" width="128" height="16" rx="8" fill="#fff" opacity=".85" transform="rotate(-6 160 96)"/><rect x="96" y="116" width="128" height="16" rx="8" fill="#fff" opacity=".7"/>'],
  Coconut: ['#8A6A2F', '#EAD6AE', '<circle cx="160" cy="100" r="46" fill="#fff"/><circle cx="160" cy="100" r="30" fill="#EAD6AE"/><circle cx="150" cy="88" r="4" fill="#8A6A2F"/><circle cx="170" cy="88" r="4" fill="#8A6A2F"/><circle cx="160" cy="104" r="4" fill="#8A6A2F"/>'],
  Food: ['#A0712B', '#F2D7A6', '<rect x="120" y="60" width="80" height="90" rx="10" fill="#fff"/><rect x="132" y="48" width="56" height="18" rx="4" fill="#fff" opacity=".8"/>'],
  Apparel: ['#3F5FA0', '#C6D3EE', '<path d="M120 52l20-10h40l20 10 26 22-16 20-14-10v70h-72V84l-14 10-16-20z" fill="#fff"/>'],
  Gems: ['#5B3FA0', '#D6CBF0', '<path d="M120 70h80l20 24-60 64-60-64z" fill="#fff"/>'],
  Ayurveda: ['#A0446B', '#F1C7D8', '<rect x="138" y="50" width="44" height="18" rx="4" fill="#fff"/><path d="M130 68h60l8 22v58a8 8 0 0 1-8 8h-60a8 8 0 0 1-8-8V90z" fill="#fff"/>'],
  Crafts: ['#0F7A8A', '#BDE6EC', '<ellipse cx="160" cy="98" rx="44" ry="56" fill="#fff"/><circle cx="144" cy="88" r="8" fill="#0F7A8A"/><circle cx="176" cy="88" r="8" fill="#0F7A8A"/>']
};
const art = (cat) => { const [a, b, shape] = ART[cat] || ART.Food; return raw(`<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true"><rect width="320" height="200" fill="${b}"/><rect width="320" height="200" fill="${a}" opacity=".4"/>${shape}</svg>`); };
const productImg = (p) => (p.photo_id ? h`<img src="/files/${p.photo_id}" alt="" loading="lazy">` : art(p.category));

// Price line: fixed-price products the buyer can order now show price + delivery; everything else shows the MOQ guide price.
function priceLine(ctx, p) {
  const { t } = ctx;
  if (p.buyable) return h`<b class="price num">${gbp(p.price_pence)}</b><span class="tiny muted">${p.delivery ? t('plusDelivery', { d: gbp(p.delivery) }) : t('freeDelivery')}</span>`;
  return h`<span><span class="tiny muted">${t('guideFrom')}</span> <b class="price num">${gbp(p.price_pence)}</b><span class="tiny muted"> / ${p.unit}</span></span><span class="tiny muted">${t('moqN', { n: p.moq, u: p.unit })}</span>`;
}
const fromChip = (ctx, from) => h`<span class="chip ${from === 'Sri Lanka' ? 'plain' : 'navyc'}">${ctx.t(from === 'Sri Lanka' ? 'fromLK' : 'fromUK')}</span>`;
const modeChip = (ctx, p) => (p.buyable ? h`<span class="chip good">${ctx.t('buyNow')}</span>` : h`<span class="chip amber">${ctx.t('getQuote')}</span>`);

function productCard(ctx, p) {
  const { lang } = ctx;
  return h`<a class="card pcard plain" href="/products/${p.id}"><span class="img">${productImg(p)}</span><span class="pad stack6">
    <span class="pname">${L(p, 'name', lang)}</span>${priceLine(ctx, p)}
    <span class="tiny muted">${L(p, 'supplier_name', lang)}</span>
    <span class="row">${modeChip(ctx, p)}${fromChip(ctx, p.ships_from)}</span></span></a>`;
}

module.exports = { L, avatar, csrfField, postBtn, options, errors, art, productImg, productCard, priceLine, fromChip, modeChip };
