'use strict';
const { h, raw, gbp, dateLabel } = require('../util');
const { dt, CATEGORIES, TYPES, DISTRICTS } = require('../i18n');
const { ZONES } = require('../pricing');
const { L, avatar, csrfField, postBtn, options, errors, art, productImg, productCard, fromChip } = require('./parts');

const STAGES = ['paid', 'packed', 'shipped', 'delivered'];
const dutyBox = (ctx, key) => (key === 'dutyNone' ? h`<div class="flash good small">${ctx.t('dutyNone')}</div>` : h`<div class="flash warn small"><b>${ctx.t('dutyTitle')}</b> ${ctx.t(key)}</div>`);

function home(ctx, d) {
  const { t, lang } = ctx;
  return h`<section class="hero"><div>
      <span class="chip onnavy">${t('heroChip')}</span>
      <h1>${t('heroH')}</h1><p>${t('heroP')}</p>
      <div class="row mt"><a class="btn buy" href="/products">${t('browse')}</a><a class="btn onnavy-b" href="/sell">${t('sellCta')}</a></div></div>
    <div class="herostats"><div><b class="num">${d.suppliers}</b><span>${t('stSuppliers')}</span></div><div><b class="num">${d.products}</b><span>${t('stProducts')}</span></div><div><b>${t('stWorld')}</b><span>${t('stWorldP')}</span></div></div></section>
  <section class="grid g3 how"><div class="card pad"><b>1. ${t('how1')}</b><p class="small muted">${t('how1p')}</p></div><div class="card pad"><b>2. ${t('how2')}</b><p class="small muted">${t('how2p')}</p></div><div class="card pad"><b>3. ${t('how3')}</b><p class="small muted">${t('how3p')}</p></div></section>
  <section><h2 class="mb">${t('categories')}</h2><div class="cats">${CATEGORIES.map((c) => h`<a class="cat" href="/products?category=${encodeURIComponent(c)}"><span class="caticon">${art(c)}</span>${dt(c, lang)}</a>`)}</div></section>
  <section><div class="sec-h"><h2>${t('bestSellers')}</h2><a href="/products">${t('seeAll')}</a></div><div class="grid g5">${d.top.map((p) => productCard(ctx, p))}</div></section>
  <section><div class="sec-h"><h2>${t('verifiedSuppliers')}</h2><a href="/suppliers">${t('seeAll')}</a></div><div class="grid g3">${d.supplierList.map((s) => supplierCard(ctx, s))}</div></section>`;
}

function supplierCard(ctx, s) {
  const { t, lang } = ctx;
  return h`<a class="card pad row top nowrap plain" href="/suppliers/${s.slug}">${avatar(s)}<span class="stack6"><b>${L(s, 'name', lang)}</b><span class="tiny muted">${dt(s.type, lang)} · ${dt(s.district, lang)} · ${t('since', { y: s.since || '' })}</span><span class="row">${fromChip(ctx, s.ships_from)}<span class="tiny">${t('nProducts', { n: s.products })}</span><span class="tiny verified">✓ ${t('verified')}</span></span></span></a>`;
}

function products(ctx, d) {
  const { t, lang } = ctx; const f = d.filters; const active = f.q || f.category || f.supplier || f.max || f.buynow || f.from;
  return h`<div class="layout"><form class="card pad side" method="get" action="/products" aria-label="${t('filters')}">
      <label class="f">${t('searchLbl')}<input name="q" value="${f.q}" placeholder="${t('searchPh')}"></label>
      <label class="f">${t('category')}<select name="category">${options(CATEGORIES, f.category, lang, t('allCategories'))}</select></label>
      <label class="f">${t('shipsFrom')}<select name="from"><option value="">${t('anywhere')}</option><option value="Sri Lanka"${f.from === 'Sri Lanka' ? raw(' selected') : ''}>${dt('Sri Lanka', lang)}</option><option value="United Kingdom"${f.from === 'United Kingdom' ? raw(' selected') : ''}>${dt('United Kingdom', lang)}</option></select></label>
      <label class="f">${t('supplier')}<select name="supplier"><option value="">${t('allSuppliers')}</option>${d.suppliers.map((s) => h`<option value="${s.slug}"${f.supplier === s.slug ? raw(' selected') : ''}>${L(s, 'name', lang)}</option>`)}</select></label>
      <label class="f">${t('maxPrice')}<input name="max" inputmode="decimal" value="${f.max}" placeholder="£"></label>
      <label class="f">${t('sort')}<select name="sort">${[['popular', 'sortPopular'], ['low', 'sortLow'], ['high', 'sortHigh'], ['new', 'sortNew']].map(([v, k]) => h`<option value="${v}"${f.sort === v ? raw(' selected') : ''}>${t(k)}</option>`)}</select></label>
      <label class="check"><input type="checkbox" name="buynow" value="1"${f.buynow ? raw(' checked') : ''}> ${t('buyNowOnly', { c: dt(ctx.country, lang) })}</label>
      <button class="btn navy">${t('apply')}</button>${active ? h`<a class="small" href="/products">${t('clearFilters')}</a>` : ''}
    </form>
    <section class="stack"><div><h1>${f.q ? t('resultsFor', { q: f.q }) : f.category ? dt(f.category, lang) : t('allProducts')}</h1><p class="small muted">${t('nResults', { n: d.list.length })} · ${t('pricesFor', { c: dt(ctx.country, lang) })}</p></div>
      ${d.supplierHits.length ? h`<div class="card pad row"><b class="small">${t('suppliersMatching')}</b>${d.supplierHits.map((s) => h`<a class="chip plain" href="/suppliers/${s.slug}">${L(s, 'name', lang)}</a>`)}</div>` : ''}
      <div class="grid g4">${d.list.length ? d.list.map((p) => productCard(ctx, p)) : h`<div class="empty">${t('noMatch')}</div>`}</div></section></div>`;
}

function deliveryTable(ctx, delivery, zone) {
  const { t } = ctx; const zs = ZONES.map((z, i) => [z, i]).filter(([z]) => delivery[z] !== undefined);
  if (!zs.length) return '';
  return h`<table class="small"><tbody>${zs.map(([z, i]) => h`<tr class="${z === zone ? 'hl' : ''}"><td>${t('zone_' + i)}</td><td class="r">${delivery[z] ? gbp(delivery[z]) : t('free')}</td></tr>`)}</tbody></table>`;
}

function product(ctx, d) {
  const { t, lang } = ctx; const p = d.product; const s = d.supplier; const v = d.values || {};
  const quoteForm = h`<form method="post" action="/products/${p.id}/request" class="stack">${csrfField(ctx)}
      <h3>${t('askQuote')}</h3>${errors(ctx, d.errors)}
      <div class="f2"><label class="f">${t('quantity')} (${p.unit})<input name="qty" type="number" min="1" value="${v.qty || p.moq}" required></label>
        <label class="f">${t('deliverTo')}<select name="country">${ctx.countries.map((c) => h`<option value="${c}"${c === (v.country || ctx.country) ? raw(' selected') : ''}>${dt(c, lang)}</option>`)}</select></label></div>
      <label class="f">${t('quoteNote')}<textarea name="note" maxlength="2000" placeholder="${t('quoteNotePh')}">${v.note || ''}</textarea></label>
      <label class="f">${t('waOptional')}<input name="whatsapp" value="${v.whatsapp || ''}" placeholder="+44 7…" inputmode="tel"><span class="tiny muted">${t('waHelp')}</span></label>
      <button class="btn ${p.buyable ? '' : 'buy'} full">${ctx.user ? t('sendRequest') : t('loginToRequest')}</button></form>`;
  return h`<p class="tiny muted"><a href="/products?category=${encodeURIComponent(p.category)}">${dt(p.category, lang)}</a> › ${L(p, 'name', lang)}</p>
  <div class="pp"><div class="card"><span class="img">${productImg(p)}</span></div>
    <div class="stack">
      <h1 class="h1s">${L(p, 'name', lang)}</h1>
      <div class="row"><span class="chip">${dt(p.category, lang)}</span>${fromChip(ctx, s.ships_from)}<span class="tiny muted">${t('soldN', { n: p.sold })}</span></div>
      ${p.buyable
        ? h`<div><span class="price big num">${gbp(p.price_pence)}</span> <span class="small muted">/ ${p.unit}</span><div class="small muted">${p.delivery ? t('plusDeliveryTo', { d: gbp(p.delivery), c: dt(ctx.country, lang) }) : t('freeDeliveryTo', { c: dt(ctx.country, lang) })}</div></div>`
        : h`<div class="guide"><span class="tiny muted">${t('guidePrice')}</span><div><span class="price big num">${gbp(p.price_pence)}</span> <span class="small muted">/ ${p.unit}</span></div><div class="small"><b>${t('moqN', { n: p.moq, u: p.unit })}</b> · ${t('guideNote')}</div></div>`}
      <p>${L(p, 'description', lang)}</p>
      <dl class="kv"><dt>${t('origin')}</dt><dd>${dt('Sri Lanka', lang)}</dd><dt>${t('shipsFrom')}</dt><dd>${s.ships_from === 'Sri Lanka' ? h`${dt(s.district, lang)}, ${dt('Sri Lanka', lang)}` : h`${s.district}, ${dt(s.ships_from, lang)}`}</dd><dt>${t('hsCode')}</dt><dd class="num">${p.hs_code}</dd><dt>${t('weight')}</dt><dd class="num">${(p.weight_g / 1000).toFixed(2)} kg</dd><dt>${t('leadTime')}</dt><dd>${t('days', { n: p.lead_days })}</dd>
        ${p.cert_id ? h`<dt>${t('certificate')}</dt><dd><a class="doc" href="/files/${p.cert_id}" target="_blank" rel="noopener">📄 ${t('viewCert')}</a></dd>` : ''}</dl>
      ${p.mode === 'fixed' && Object.keys(d.delivery).length ? h`<div class="card pad stack"><h3>${t('deliveryCharges')}</h3><p class="tiny muted">${t('perParcel')}</p>${deliveryTable(ctx, d.delivery, ctx.zone)}</div>` : ''}
    </div>
    <aside class="card pad stack sticky">
      <a href="/suppliers/${s.slug}" class="row nowrap plain">${avatar(s)}<span><b class="small">${L(s, 'name', lang)}</b><br><span class="tiny verified">✓ ${t('verified')}</span></span></a>
      ${p.buyable ? (p.stock >= p.moq ? h`<form method="post" action="/cart/add" class="stack">${csrfField(ctx)}<input type="hidden" name="product_id" value="${p.id}">
          <label class="f">${t('quantity')}<input class="qty" type="number" name="qty" min="${p.moq}" max="${p.stock}" value="${p.moq}"></label>
          <button class="btn buy full">${t('addToCart')}</button><span class="tiny muted">${t('inStock', { n: p.stock })}${p.moq > 1 ? ' · ' + t('moqN', { n: p.moq, u: p.unit }) : ''}</span></form>` : h`<p class="small muted">${t('outOfStockP')}</p>`)
        : p.mode === 'fixed' ? h`<p class="small muted">${t('noDeliveryHere')}</p>` : ''}
      ${p.buyable ? h`<div class="or"><span>${t('or')}</span></div>
        <details class="qd"${d.errors ? raw(' open') : ''}><summary class="btn outline full">${t('bulkQuoteBtn')}</summary>${quoteForm}</details>
        <p class="tiny muted qhelp">${t('bulkQuoteHelp')}${p.moq > 1 ? '' : ' ' + t('bulkCheaper')}</p>` : quoteForm}
      ${dutyBox(ctx, d.dutyKey)}
    </aside></div>
  ${d.more.length ? h`<section><h2 class="mb">${t('moreFrom', { s: L(s, 'name', lang) })}</h2><div class="grid g5">${d.more.map((x) => productCard(ctx, x))}</div></section>` : ''}`;
}

function suppliers(ctx, d) {
  const { t, lang } = ctx; const f = d.filters;
  return h`<section class="sec-h"><div><h1>${t('suppliersH')}</h1><p class="muted measure">${t('suppliersP')}</p></div><a class="btn buy sm" href="/sell">${t('sellCta')}</a></section>
    <form class="filters" method="get" action="/suppliers" role="search"><label class="sr" for="sq">${t('searchLbl')}</label><input id="sq" name="q" value="${f.q}" placeholder="${t('searchSuppliersPh')}">
      <select name="type" aria-label="${t('type')}">${options(TYPES, f.type, lang, t('allTypes'))}</select><select name="category" aria-label="${t('category')}">${options(CATEGORIES, f.category, lang, t('allCategories'))}</select>
      <select name="from" aria-label="${t('shipsFrom')}"><option value="">${t('shipsFrom')}: ${t('anywhere')}</option>${['Sri Lanka', 'United Kingdom'].map((c) => h`<option value="${c}"${f.from === c ? raw(' selected') : ''}>${dt(c, lang)}</option>`)}</select>
      <button class="btn sm navy">${t('search')}</button>${f.q || f.type || f.category || f.from ? h`<a class="btn sm ghost" href="/suppliers">${t('clearFilters')}</a>` : ''}</form>
    <div class="grid g3">${d.list.length ? d.list.map((s) => supplierCard(ctx, s)) : h`<div class="empty">${t('noMatch')}</div>`}</div>`;
}
function supplier(ctx, d) {
  const { t, lang } = ctx; const s = d.supplier;
  return h`<section class="card pad row top">${avatar(s, true)}<div class="stack grow"><h1>${L(s, 'name', lang)}</h1><div class="small muted">${dt(s.type, lang)} · ${dt(s.district, lang)}, ${dt(s.ships_from, lang)} · ${t('since', { y: s.since || '' })} <span class="verified">✓ ${t('verifiedSupplier')}</span></div><p>${L(s, 'about', lang)}</p></div>
      ${Object.keys(d.delivery).length ? h`<div class="card pad stack minw"><b class="small">${t('deliveryCharges')}</b>${deliveryTable(ctx, d.delivery, ctx.zone)}</div>` : ''}</section>
    <section><h2 class="mb">${t('productsN', { n: d.products.length })}</h2><div class="grid g5">${d.products.length ? d.products.map((p) => productCard(ctx, p)) : h`<div class="empty">${t('noProducts')}</div>`}</div></section>`;
}

/* ---------------- cart and checkout ---------------- */
function summaryTable(ctx, q) {
  const { t } = ctx;
  return h`<table class="small"><tbody><tr><td>${t('goods')}</td><td class="r">${gbp(q.goods)}</td></tr><tr><td>${t('delivery')}</td><td class="r">${gbp(q.shipping)}</td></tr>${q.vat ? h`<tr><td>${t('ukVatSmall')}</td><td class="r">${gbp(q.vat)}</td></tr>` : ''}<tr><td><b>${t('totalToPay')}</b></td><td class="r"><b>${gbp(q.total)}</b></td></tr></tbody></table>`;
}
function cart(ctx, d) {
  const { t, lang } = ctx;
  if (!d.groups.length) return h`<section class="narrow card pad stack"><h1>${t('cartEmpty')}</h1><p class="muted">${t('cartEmptyP')}</p><div><a class="btn buy" href="/products?buynow=1">${t('browse')}</a></div></section>`;
  return h`<h1>${t('cart')}</h1><p class="small muted">${t('pricesFor', { c: dt(ctx.country, lang) })}</p><div class="pp two"><div class="stack">${d.groups.map((g) => h`<section class="card"><div class="pad row nowrap bb">${avatar(g.supplier)}<div class="grow"><b>${L(g.supplier, 'name', lang)}</b><div class="tiny muted">${t('parcelFrom', { d: dt(g.supplier.ships_from, lang) })}</div></div>${g.parcel ? h`<span class="small">${t('delivery')}: <b>${g.parcel.shipping ? gbp(g.parcel.shipping) : t('free')}</b></span>` : ''}</div>
      ${g.lines.map((l) => h`<div class="pad row nowrap top bb"><a class="thumbsm" href="/products/${l.product.id}">${productImg(l.product)}</a><div class="stack6 grow"><a class="pname plain" href="/products/${l.product.id}">${L(l.product, 'name', lang)}</a><span class="tiny muted">${gbp(l.product.price_pence)} · ${!l.product.buyable ? h`<span class="warn-t">${t('noDeliveryHere')}</span>` : l.product.stock < l.qty ? h`<span class="warn-t">${t('onlyLeft', { n: l.product.stock })}</span>` : l.qty < l.product.moq ? h`<span class="warn-t">${t('moqN', { n: l.product.moq, u: l.product.unit })}</span>` : t('inStock', { n: l.product.stock })}</span></div>
        <form method="post" action="/cart/update" class="row">${csrfField(ctx)}<input type="hidden" name="product_id" value="${l.product.id}"><label class="sr" for="q${l.product.id}">${t('quantity')}</label><input id="q${l.product.id}" class="qty" type="number" name="qty" min="0" value="${l.qty}"><button class="btn sm">${t('update')}</button></form>
        <b class="num">${gbp(l.product.price_pence * l.qty)}</b></div>`)}</section>`)}</div>
    <aside class="card pad stack sticky"><h3>${t('orderSummary')}</h3><p class="small muted">${t('nParcels', { n: d.summary.parcels.length })}</p>${summaryTable(ctx, d.summary)}
      ${d.problems ? h`<p class="small warn-t">${t('fixCart')}</p>` : h`<a class="btn buy full" href="/checkout">${t('checkout')}</a>`}${dutyBox(ctx, d.dutyKey)}</aside></div>`;
}
function checkout(ctx, d) {
  const { t, lang } = ctx; const v = d.values || {};
  return h`<h1>${t('checkout')}</h1><div class="pp two"><form class="card pad form" method="post" action="${d.action}">${csrfField(ctx)}${errors(ctx, d.errors)}
      <h3>${t('deliveryAddress')}</h3>
      <p class="small">${t('deliverTo')}: <b>${dt(d.country, lang)}</b>${d.lockCountry ? '' : h` · <span class="tiny muted">${t('changeCountryTop')}</span>`}</p>
      <div class="f2"><label class="f">${t('fullName')} *<input name="name" value="${v.name || ''}" required maxlength="120" autocomplete="name"></label><label class="f">${t('email')} *<input type="email" name="email" value="${v.email || ''}" required maxlength="200" autocomplete="email"></label></div>
      <label class="f">${t('address1')} *<input name="address1" value="${v.address1 || ''}" required maxlength="160" autocomplete="address-line1"></label>
      <label class="f">${t('address2')}<input name="address2" value="${v.address2 || ''}" maxlength="160" autocomplete="address-line2"></label>
      <div class="f2"><label class="f">${t('city')} *<input name="city" value="${v.city || ''}" required maxlength="80" autocomplete="address-level2"></label><label class="f">${t('postcode')}${d.country === 'United Kingdom' ? ' *' : ''}<input name="postcode" value="${v.postcode || ''}" maxlength="16" autocomplete="postal-code"${d.country === 'United Kingdom' ? raw(' required') : ''}></label></div>
      <label class="f">${t('phoneCourier')}<input name="phone" value="${v.phone || ''}" maxlength="30" autocomplete="tel"></label>
      <button class="btn buy">${t('continueToPay')}</button></form>
    <aside class="card pad stack sticky"><h3>${t('orderSummary')}</h3>${summaryTable(ctx, d.summary)}${dutyBox(ctx, d.dutyKey)}</aside></div>`;
}
function pay(ctx, d) {
  const { t } = ctx; const o = d.order;
  return h`<section class="narrow"><form class="card pad form" method="post" action="/pay/${o.ref}">${csrfField(ctx)}<h1>${t('payment')}</h1>
    <p class="muted small">${t('orderRef')} ${o.ref}</p>
    ${summaryTable(ctx, { goods: o.goods_pence, shipping: o.shipping_pence, vat: o.vat_pence, total: o.total_pence })}
    ${dutyBox(ctx, d.dutyKey)}
    ${d.testMode ? h`<div class="flash">${t('testModeNote')}</div><label class="f">${t('card')}<input value="4242 4242 4242 4242" readonly></label>` : ''}
    <button class="btn buy">${t('payN', { a: gbp(o.total_pence) })}</button></form></section>`;
}
function orderPage(ctx, d) {
  const { t, lang } = ctx; const o = d.order;
  return h`<section class="row between"><div><h1>${t('orderN', { r: o.ref })}</h1><p class="small muted">${dateLabel(o.created_at, lang)} · ${o.city}, ${dt(o.country, lang)} · ${gbp(o.total_pence)}${d.requestRef ? h` · <a href="/messages/${d.requestRef}">${t('viewConversation')}</a>` : ''}</p></div>${o.status === 'paid' ? h`<span class="chip good">✓ ${t('paid')}</span>` : h`<a class="btn buy" href="/pay/${o.ref}">${t('payNow')}</a>`}</section>
  ${d.justPaid ? h`<div class="flash good">${t('thanksOrder', { n: d.shipments.length })}</div>` : ''}
  ${dutyBox(ctx, d.dutyKey)}
  <div class="grid g2">${d.shipments.map((s) => h`<section class="card pad stack"><div class="row nowrap">${avatar(s.supplier)}<b>${L(s.supplier, 'name', lang)}</b>${fromChip(ctx, s.supplier.ships_from)}</div>
    <div class="track">${STAGES.map((st, i) => h`<i class="${STAGES.indexOf(s.status) >= i ? 'on' : ''}"></i>`)}</div><div class="row between tiny muted">${STAGES.map((st) => h`<span>${t('sh_' + st)}</span>`)}</div>
    <ul class="small">${s.items.map((i) => h`<li>${i.qty} × ${i.name}</li>`)}</ul>
    <div class="small">${s.tracking ? h`${t('tracking')}: <b class="num">${s.tracking}</b>` : h`<span class="muted">${t('trackingSoon')}</span>`}</div></section>`)}</div>`;
}
function orders(ctx, d) {
  const { t, lang } = ctx;
  return h`<h1>${t('myOrders')}</h1><section class="card tw"><table><thead><tr><th>${t('orderRef')}</th><th>${t('date')}</th><th>${t('deliverTo')}</th><th class="r">${t('total')}</th><th>${t('status')}</th><th></th></tr></thead><tbody>
    ${d.list.map((o) => h`<tr><td class="num"><b>${o.ref}</b></td><td>${dateLabel(o.created_at, lang)}</td><td>${dt(o.country, lang)}</td><td class="r">${gbp(o.total_pence)}</td><td><span class="chip ${o.status === 'paid' ? 'good' : 'plain'}">${t('os_' + o.status)}</span></td><td><a href="/orders/${o.ref}">${t('view')}</a></td></tr>`)}
    ${d.list.length ? '' : h`<tr><td colspan="6" class="empty">${t('noOrders')}</td></tr>`}</tbody></table></section>`;
}

/* ---------------- accounts ---------------- */
function login(ctx, d) {
  const { t } = ctx;
  return h`<section class="narrow"><form class="card pad form" method="post" action="/login">${csrfField(ctx)}<input type="hidden" name="next" value="${d.next || ''}"><h1>${t('login')}</h1>${errors(ctx, d.errors)}
    <label class="f">${t('email')}<input type="email" name="email" value="${d.email || ''}" required autocomplete="email"></label>
    <label class="f">${t('password')}<input type="password" name="password" required autocomplete="current-password"></label>
    <button class="btn navy">${t('login')}</button><p class="small">${t('noAccount')} <a href="/register${d.next ? raw('?next=' + encodeURIComponent(d.next)) : ''}">${t('register')}</a></p>
    ${process.env.DEMO_MODE === '1' && process.env.DEMO_PASSWORD ? h`<div class="tiny muted stack6"><span>${t('demoLogins')}</span><span>supplier@demo.kuviyam.org · ${t('demoSupplierLK')}</span><span>ukshop@demo.kuviyam.org · ${t('demoSupplierUK')}</span><span>buyer@demo.kuviyam.org · ${t('demoBuyer')}</span><span>${t('password')}: ${process.env.DEMO_PASSWORD}</span></div>` : ''}</form></section>`;
}
function register(ctx, d) {
  const { t } = ctx;
  return h`<section class="narrow"><form class="card pad form" method="post" action="/register">${csrfField(ctx)}<input type="hidden" name="next" value="${d.next || ''}"><h1>${t('register')}</h1>${errors(ctx, d.errors)}
    <label class="f">${t('fullName')}<input name="name" value="${d.name || ''}" required maxlength="120" autocomplete="name"></label>
    <label class="f">${t('email')}<input type="email" name="email" value="${d.email || ''}" required maxlength="200" autocomplete="email"></label>
    <label class="f">${t('password')}<input type="password" name="password" required minlength="10" autocomplete="new-password"><span class="tiny muted">${t('pwHint')}</span></label>
    <button class="btn navy">${t('register')}</button><p class="small">${t('haveAccount')} <a href="/login">${t('login')}</a></p></form></section>`;
}
function setup(ctx, d) {
  const { t } = ctx;
  return h`<section class="narrow"><form class="card pad form" method="post" action="/setup">${csrfField(ctx)}<h1>${t('setupH')}</h1><p class="small muted">${t('setupP')}</p>${errors(ctx, d.errors)}
    <label class="f">${t('setupCode')}<input name="code" required autocomplete="off"></label><label class="f">${t('fullName')}<input name="name" value="${d.name || ''}" required></label>
    <label class="f">${t('email')}<input type="email" name="email" value="${d.email || ''}" required></label><label class="f">${t('password')}<input type="password" name="password" required minlength="12" autocomplete="new-password"></label>
    <button class="btn navy">${t('setupBtn')}</button></form></section>`;
}

/* ---------------- sell (supplier application) ---------------- */
function sellAside(ctx) { const { t } = ctx; return h`<aside class="card pad stack sticky"><h3>${t('whySell')}</h3><ul class="small">${['w1', 'w2', 'w3', 'w4'].map((k) => h`<li>${t(k)}</li>`)}</ul><p class="tiny muted">${t('commissionNote', { p: ctx.commission })}</p></aside>`; }
function sellIntro(ctx) {
  const { t } = ctx;
  return h`<section class="split"><div class="card pad stack"><h1>${t('sellH')}</h1><p class="muted">${t('sellP')}</p><p>${t('sellNeedAccount')}</p><div class="row"><a class="btn navy" href="/register?next=/sell">${t('register')}</a><a class="btn" href="/login?next=/sell">${t('login')}</a></div></div>${sellAside(ctx)}</section>`;
}
function sellForm(ctx, d) {
  const { t, lang } = ctx; const v = d.values; const cats = [].concat(v.categories || []); const from = v.ships_from || 'Sri Lanka';
  return h`<div class="split"><form class="card pad form" method="post" action="/sell" enctype="multipart/form-data">${csrfField(ctx)}<h1>${t('sellH')}</h1><p class="small muted">${t('sellP')}</p>${errors(ctx, d.errors)}
    <fieldset class="stack"><legend class="lbl">${t('whereBased')} *</legend><div class="ticks">${['Sri Lanka', 'United Kingdom'].map((c) => h`<label><input type="radio" name="ships_from" value="${c}"${from === c ? raw(' checked') : ''}> ${dt(c, lang)}</label>`)}</div><span class="tiny muted">${t('whereBasedHelp')}</span></fieldset>
    <div class="f2"><label class="f">${t('bizNameEn')} *<input name="name" value="${v.name || ''}" required maxlength="160"></label><label class="f">${t('bizNameTa')}<input name="name_ta" value="${v.name_ta || ''}" lang="ta" maxlength="160"></label></div>
    <div class="f3"><label class="f">${t('type')} *<select name="type">${options(TYPES, v.type, lang)}</select></label><label class="f">${t('districtLK')}<select name="district">${options(DISTRICTS, v.district || 'Colombo', lang)}</select></label><label class="f">${t('townUK')}<input name="town" value="${v.town || ''}" maxlength="80" placeholder="East Ham, London"></label></div>
    <div class="f2"><label class="f">${t('brNo')} *<input name="br_no" value="${v.br_no || ''}" required maxlength="60"></label><label class="f">${t('phoneWa')}<input name="phone" value="${v.phone || ''}" maxlength="30"></label></div>
    <div class="f2"><label class="f">${t('contactName')} *<input name="contact" value="${v.contact || ''}" required maxlength="120"></label><label class="f">${t('email')} *<input type="email" name="email" value="${v.email || ''}" required maxlength="200"></label></div>
    <fieldset class="stack"><legend class="lbl">${t('whatSell')} *</legend><div class="ticks">${CATEGORIES.map((c) => h`<label><input type="checkbox" name="categories" value="${c}"${cats.includes(c) ? raw(' checked') : ''}> ${dt(c, lang)}</label>`)}</div></fieldset>
    <label class="f">${t('aboutEn')} *<textarea name="about" required maxlength="1500">${v.about || ''}</textarea></label>
    <label class="f">${t('aboutTa')}<textarea name="about_ta" lang="ta" maxlength="1500">${v.about_ta || ''}</textarea></label>
    <h3>${t('documents')}</h3><p class="tiny muted">${t('docNote')}</p>
    <div class="f2"><label class="f">${t('docBr')} *<input type="file" name="doc_br" accept=".pdf,image/jpeg,image/png,image/webp" required></label><label class="f">${t('docId')} *<input type="file" name="doc_id" accept=".pdf,image/jpeg,image/png,image/webp" required></label></div>
    <div class="f2"><label class="f">${t('docBank')} *<input type="file" name="doc_bank" accept=".pdf,image/jpeg,image/png,image/webp" required></label><label class="f">${t('docEdb')}<input type="file" name="doc_edb" accept=".pdf,image/jpeg,image/png,image/webp"></label></div>
    <label class="check"><input type="checkbox" name="agree" value="1" required> ${t('agreeSeller', { p: ctx.commission })}</label>
    <button class="btn buy">${t('submitApp')}</button></form>${sellAside(ctx)}</div>`;
}
function sellStatus(ctx, d) {
  const { t, lang } = ctx;
  return h`<section class="narrow stack"><h1>${t('myApplications')}</h1>${d.apps.map((a) => h`<div class="card pad stack"><div class="row between"><b>${a.name}</b><span class="chip ${a.status === 'approved' ? 'good' : a.status === 'rejected' ? 'bad' : 'plain'}">${t('app_' + a.status)}</span></div>
    <div class="small muted">${dt(a.type, lang)} · ${dt(a.district, lang)}, ${dt(a.ships_from, lang)} · ${t('submitted', { d: dateLabel(a.created_at, lang) })}</div>${a.status === 'rejected' && a.reason ? h`<p class="small">${t('reason')}: ${a.reason}</p>` : ''}${a.status === 'approved' ? h`<a class="btn navy" href="/dashboard">${t('openDashboard')}</a>` : ''}</div>`)}
    <p class="small"><a href="/sell?new=1">${t('newApp')}</a></p></section>`;
}

const message = (ctx, title, text, link) => h`<section class="narrow"><div class="card pad stack"><h1>${title}</h1><p class="muted">${text}</p>${link ? h`<div><a class="btn" href="${link[0]}">${link[1]}</a></div>` : ''}</div></section>`;

module.exports = { home, products, product, suppliers, supplier, cart, checkout, pay, orderPage, orders, login, register, setup, sellIntro, sellForm, sellStatus, message, postBtn, STAGES, dutyBox, deliveryTable };
