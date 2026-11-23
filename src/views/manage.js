'use strict';
const { h, raw, gbp, dateLabel } = require('../util');
const { dt, CATEGORIES } = require('../i18n');
const { ZONES } = require('../pricing');
const { L, avatar, csrfField, postBtn, options, errors, productImg } = require('./parts');

const chip = (ctx, s, prefix = 'st_') => h`<span class="chip ${['live', 'verified', 'shipped', 'delivered', 'paid', 'approved', 'sent'].includes(s) ? 'good' : ['returned', 'suspended', 'rejected', 'hidden'].includes(s) ? 'bad' : 'plain'}">${ctx.t(prefix + s)}</span>`;

/* ================= supplier dashboard ================= */
function tabs(ctx, active) {
  const items = [['/dashboard', 'tOverview', 'overview'], ['/dashboard/products', 'tProducts', 'products'], ['/dashboard/products/new', 'tAddProduct', 'new'], ['/messages', 'nav_messages', 'messages'], ['/dashboard/orders', 'tOrders', 'orders'], ['/dashboard/payouts', 'tPayouts', 'payouts'], ['/dashboard/settings', 'tShopSettings', 'settings']];
  return h`<nav class="tabs" aria-label="${ctx.t('dashH')}">${items.map(([href, k, id]) => h`<a href="${href}" class="${active === id ? 'on' : ''}">${ctx.t(k)}</a>`)}</nav>`;
}
const head = (ctx, s) => h`<section class="row between"><div class="row nowrap">${avatar(s)}<div><h1>${L(s, 'name', ctx.lang)}</h1><div class="small muted">${ctx.t('dashH')}</div></div></div><a class="btn" href="/suppliers/${s.slug}">${ctx.t('viewStore')}</a></section>`;

function dashboard(ctx, d) {
  const { t } = ctx;
  return h`${head(ctx, d.supplier)}${tabs(ctx, 'overview')}
  <section class="grid g5">
    <div class="card pad stat"><span class="small muted">${t('salesTotal')}</span><b class="num">${gbp(d.stats.sales)}</b></div>
    <div class="card pad stat"><span class="small muted">${t('toQuote')}</span><b class="num">${d.stats.toQuote}</b><a class="tiny" href="/messages">${t('nav_messages')} →</a></div>
    <div class="card pad stat"><span class="small muted">${t('toShip')}</span><b class="num">${d.stats.toShip}</b></div>
    <div class="card pad stat"><span class="small muted">${t('liveProducts')}</span><b class="num">${d.stats.live}</b><span class="tiny muted">${t('inReviewN', { n: d.stats.review })}</span></div>
    <div class="card pad stat"><span class="small muted">${t('payoutDue')}</span><b class="num">${gbp(d.stats.payout)}</b><span class="tiny muted">${t('afterCommission', { p: d.commission })}</span></div>
  </section>
  ${d.waReady ? '' : h`<div class="flash">${t('waNudge')} <a href="/dashboard/settings">${t('tShopSettings')} →</a></div>`}
  ${d.noRates ? h`<div class="flash warn">${t('noRatesNudge')} <a href="/dashboard/settings">${t('tShopSettings')} →</a></div>` : ''}
  ${d.stats.toShip ? h`<div class="flash warn">${t('toShipNote', { n: d.stats.toShip })} <a href="/dashboard/orders">${t('tOrders')} →</a></div>` : ''}
  ${d.lowStock.length ? h`<section class="card pad stack"><h3>${t('lowStock')}</h3>${d.lowStock.map((p) => h`<div class="row between small"><a href="/dashboard/products/${p.id}">${L(p, 'name', ctx.lang)}</a><span class="warn-t">${t('inStock', { n: p.stock })}</span></div>`)}</section>` : ''}`;
}

function productList(ctx, d) {
  const { t, lang } = ctx;
  return h`${head(ctx, d.supplier)}${tabs(ctx, 'products')}
  <section class="card tw"><table><thead><tr><th></th><th>${t('product')}</th><th>${t('hsCode')}</th><th>${t('sellingAs')}</th><th class="r">${t('price')}</th><th class="r">${t('stock')}</th><th class="r">${t('sold')}</th><th>${t('status')}</th><th></th></tr></thead><tbody>
    ${d.products.map((p) => h`<tr><td><span class="thumbsm">${productImg(p)}</span></td><td>${L(p, 'name', lang)}<div class="tiny muted">${dt(p.category, lang)}</div>${p.reason ? h`<div class="tiny warn-t">${t('reviewNote')}: ${p.reason}</div>` : ''}</td><td class="num">${p.hs_code}</td><td><span class="chip ${p.mode === 'fixed' ? 'good' : 'amber'}">${t(p.mode === 'fixed' ? 'modeFixed' : 'modeQuote')}</span><div class="tiny muted">${t('moqN', { n: p.moq, u: p.unit })}</div></td><td class="r">${gbp(p.price_pence)}</td><td class="r ${p.stock < 5 ? 'warn-t' : ''}">${p.stock}</td><td class="r">${p.sold}</td><td>${chip(ctx, p.status)}</td><td><a href="/dashboard/products/${p.id}">${t('edit')}</a></td></tr>`)}
    ${d.products.length ? '' : h`<tr><td colspan="9" class="empty">${t('noProductsYet')} <a href="/dashboard/products/new">${t('tAddProduct')}</a></td></tr>`}</tbody></table></section>`;
}

function productForm(ctx, d) {
  const { t, lang } = ctx; const v = d.values; const editing = !!d.product;
  return h`${head(ctx, d.supplier)}${tabs(ctx, editing ? 'products' : 'new')}
  <form class="card pad form measure-w" method="post" action="${editing ? `/dashboard/products/${d.product.id}` : '/dashboard/products'}" enctype="multipart/form-data">${csrfField(ctx)}
    <h2>${editing ? t('editProduct') : t('tAddProduct')}</h2><p class="tiny muted">${editing ? t('editNote') : t('reviewNoteNew')}</p>${errors(ctx, d.errors)}
    <div class="f2"><label class="f">${t('nameEn')} *<input name="name" value="${v.name || ''}" required maxlength="160"></label><label class="f">${t('nameTa')}<input name="name_ta" value="${v.name_ta || ''}" lang="ta" maxlength="160"></label></div>
    <div class="f3"><label class="f">${t('category')} *<select name="category">${options(CATEGORIES, v.category, lang)}</select></label><label class="f">${t('hsCode')} *<input name="hs_code" value="${v.hs_code || ''}" required maxlength="12" placeholder="0902.40"><span class="tiny muted">${t('hsHelp')}</span></label><label class="f">${t('unitLbl')}<input name="unit" value="${v.unit || 'item'}" maxlength="20"></label></div>
    <fieldset class="stack"><legend class="lbl">${t('howSell')} *</legend><div class="modes">
      <label class="card pad"><input type="radio" name="mode" value="quote"${v.mode !== 'fixed' ? raw(' checked') : ''}> <b>${t('modeQuote')}</b><span class="tiny muted">${t('modeQuoteHelp')}</span></label>
      <label class="card pad"><input type="radio" name="mode" value="fixed"${v.mode === 'fixed' ? raw(' checked') : ''}> <b>${t('modeFixed')}</b><span class="tiny muted">${t('modeFixedHelp')}</span></label></div></fieldset>
    <div class="f3"><label class="f">${t('priceLbl')} *<input name="price" inputmode="decimal" value="${v.price || ''}" required><span class="tiny muted">${t('priceHelp')}</span></label><label class="f">${t('moqLbl')} *<input name="moq" type="number" min="1" max="100000" value="${v.moq || 1}" required></label><label class="f">${t('stock')} *<input name="stock" type="number" min="0" max="1000000" value="${v.stock ?? ''}" required></label></div>
    <div class="f2"><label class="f">${t('weightG')} *<input name="weight_g" type="number" min="1" max="30000" value="${v.weight_g || ''}" required></label><label class="f">${t('leadDays')}<input name="lead_days" type="number" min="1" max="90" value="${v.lead_days || 7}"></label></div>
    <div class="f2"><label class="f">${t('descEn')} *<textarea name="description" required maxlength="3000">${v.description || ''}</textarea></label><label class="f">${t('descTa')}<textarea name="description_ta" lang="ta" maxlength="3000">${v.description_ta || ''}</textarea></label></div>
    <div class="f2"><label class="f">${t('photo')}${editing ? h` <span class="tiny muted">(${t('keepPhoto')})</span>` : ''}<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>
      <label class="f">${t('certFile')}<input type="file" name="cert" accept=".pdf,image/jpeg,image/png,image/webp"><span class="tiny muted">${t('certHelp')}</span></label></div>
    ${editing ? h`<label class="check"><input type="checkbox" name="hidden" value="1"${d.product.status === 'hidden' ? raw(' checked') : ''}> ${t('hideProduct')}</label>` : ''}
    <div><button class="btn navy">${editing ? t('save') : t('submitReview')}</button></div></form>`;
}

function orders(ctx, d) {
  const { t, lang } = ctx;
  return h`${head(ctx, d.supplier)}${tabs(ctx, 'orders')}
  <section class="card tw"><table><thead><tr><th>${t('orderRef')}</th><th>${t('date')}</th><th>${t('items')}</th><th>${t('shipTo')}</th><th>${t('status')}</th><th>${t('tracking')}</th></tr></thead><tbody>
    ${d.shipments.map((s) => h`<tr><td class="num"><b>${s.ref}</b></td><td>${dateLabel(s.created_at, lang)}</td><td class="small">${s.items.map((i) => h`<div>${i.qty} × ${i.name}</div>`)}<div class="tiny muted">${gbp(s.goods_pence)}</div></td>
      <td class="small">${s.name}<br>${s.address1}${s.address2 ? ', ' + s.address2 : ''}<br>${s.city} ${s.postcode}, ${dt(s.country, lang)}</td><td>${chip(ctx, s.status, 'sh_')}</td>
      <td>${s.status === 'paid' ? postBtn(ctx, `/dashboard/shipments/${s.id}/packed`, t('markPacked'))
        : s.status === 'packed' ? h`<form method="post" action="/dashboard/shipments/${s.id}/shipped" class="row">${csrfField(ctx)}<label class="sr" for="tr${s.id}">${t('tracking')}</label><input id="tr${s.id}" name="tracking" required maxlength="80" placeholder="${t('trackingPh')}"><button class="btn sm navy">${t('markShipped')}</button></form>`
        : h`<span class="tiny num">${s.tracking || ''}</span>`}</td></tr>`)}
    ${d.shipments.length ? '' : h`<tr><td colspan="6" class="empty">${t('noOrdersYet')}</td></tr>`}</tbody></table></section>`;
}

function payouts(ctx, d) {
  const { t } = ctx;
  return h`${head(ctx, d.supplier)}${tabs(ctx, 'payouts')}
  <section class="grid g3">
    <div class="card pad stat"><span class="small muted">${t('shippedSales')}</span><b class="num">${gbp(d.gross)}</b></div>
    <div class="card pad stat"><span class="small muted">${t('commissionN', { p: d.commission })}</span><b class="num">−${gbp(d.fee)}</b></div>
    <div class="card pad stat"><span class="small muted">${t('dueToYou')}</span><b class="num">${gbp(d.gross - d.fee)}</b><span class="tiny muted">≈ Rs ${Math.round((d.gross - d.fee) / 100 * d.rate).toLocaleString('en-GB')}</span></div>
  </section><p class="small muted">${t('payoutNote', { r: d.rate })}</p>`;
}

/* ================= admin ================= */
function adminTabs(ctx, active) {
  const items = [['/admin', 'tQueue', 'queue'], ['/admin/suppliers', 'tSuppliers', 'suppliers'], ['/admin/requests', 'tRequests', 'requests'], ['/admin/orders', 'tOrders', 'orders'], ['/admin/whatsapp', 'tWhatsapp', 'whatsapp'], ['/admin/settings', 'tSettings', 'settings']];
  return h`<nav class="tabs" aria-label="${ctx.t('adminH')}">${items.map(([href, k, id]) => h`<a href="${href}" class="${active === id ? 'on' : ''}">${ctx.t(k)}</a>`)}</nav>`;
}
function admin(ctx, d) {
  const { t, lang } = ctx;
  return h`<section><h1>${t('adminH')}</h1><p class="muted">${t('adminP')}</p></section>
  <section class="grid g4"><div class="card pad stat"><span class="small muted">${t('waitingReview')}</span><b class="num">${d.apps.length + d.products.length}</b></div><div class="card pad stat"><span class="small muted">${t('liveSuppliers')}</span><b class="num">${d.stats.suppliers}</b><span class="tiny muted">${t('openReqN', { n: d.stats.open })}</span></div>
    <div class="card pad stat"><span class="small muted">${t('salesPaid')}</span><b class="num">${gbp(d.stats.gmv)}</b></div><div class="card pad stat"><span class="small muted">${t('commissionEarned')}</span><b class="num">${gbp(d.stats.fees)}</b></div></section>
  ${adminTabs(ctx, 'queue')}
  <section class="card">${d.apps.map((a) => h`<div class="queue-item"><div><span class="chip plain">${t('qSupplier')}</span><div><b>${a.name}</b></div><div class="small muted">${dt(a.type, lang)} · ${dt(a.district, lang)} · ${t('docsN', { n: a.docs })} · ${dateLabel(a.created_at, lang)}</div></div><a class="btn sm" href="/admin/applications/${a.id}">${t('review')}</a></div>`)}
    ${d.products.map((p) => h`<div class="queue-item"><div class="row nowrap"><span class="thumbsm">${productImg(p)}</span><div><span class="chip plain">${t('qProduct')}</span><div><b>${p.name}</b></div><div class="small muted">${p.supplier_name} · ${dt(p.category, lang)} · HS ${p.hs_code} · ${gbp(p.price_pence)} · ${t(p.mode === 'fixed' ? 'modeFixed' : 'modeQuote')}${p.category === 'Gems' && !p.cert_id ? h` · <span class="warn-t">${t('certMissing')}</span>` : ''}</div></div></div><a class="btn sm" href="/admin/products/${p.id}">${t('review')}</a></div>`)}
    ${d.apps.length + d.products.length ? '' : h`<div class="empty">${t('allClear')}</div>`}</section>`;
}
function adminApplication(ctx, d) {
  const { t, lang } = ctx; const a = d.app; const labels = { br: 'docBr', id: 'docId', bank: 'docBank', edb: 'docEdb' };
  return h`${adminTabs(ctx, 'queue')}<section class="split"><div class="card pad stack"><h1>${a.name}</h1>${a.name_ta ? h`<div class="muted" lang="ta">${a.name_ta}</div>` : ''}
    <dl class="kv"><dt>${t('type')}</dt><dd>${dt(a.type, lang)}</dd><dt>${t('whereBased')}</dt><dd>${dt(a.district, lang)}, ${dt(a.ships_from, lang)}</dd><dt>${t('brNo')}</dt><dd>${a.br_no}</dd><dt>${t('contactName')}</dt><dd>${a.contact}<br>${a.email} · ${a.phone || '—'}</dd>
      <dt>${t('whatSell')}</dt><dd>${a.categories.split(',').map((c) => dt(c, lang)).join(', ')}</dd><dt>${t('aboutEn')}</dt><dd>${a.about}</dd><dt>${t('aboutTa')}</dt><dd lang="ta">${a.about_ta || '—'}</dd>
      ${d.files.map((f) => h`<dt>${t(labels[f.label] || 'documents')}</dt><dd><a class="doc" href="/files/${f.id}" target="_blank" rel="noopener">📄 ${f.filename}</a></dd>`)}</dl></div>
    ${a.status === 'pending' ? h`<aside class="card pad stack sticky"><form method="post" action="/admin/applications/${a.id}/approve">${csrfField(ctx)}<p class="small">${t('approveSupplierHint')}</p><button class="btn navy">${t('approve')}</button></form>
      <form method="post" action="/admin/applications/${a.id}/reject" class="stack">${csrfField(ctx)}<label class="f">${t('reason')}<textarea name="reason" required maxlength="500"></textarea></label><button class="btn">${t('reject')}</button></form></aside>` : h`<aside class="card pad">${chip(ctx, a.status, 'app_')}</aside>`}</section>`;
}
function adminProduct(ctx, d) {
  const { t, lang } = ctx; const p = d.product;
  return h`${adminTabs(ctx, 'queue')}<section class="split"><div class="card pad stack"><span class="img wide">${productImg(p)}</span><h1>${p.name}</h1>${p.name_ta ? h`<div class="muted" lang="ta">${p.name_ta}</div>` : ''}
    <dl class="kv"><dt>${t('supplier')}</dt><dd>${p.supplier_name}</dd><dt>${t('category')}</dt><dd>${dt(p.category, lang)}</dd><dt>${t('hsCode')}</dt><dd>${p.hs_code}</dd><dt>${t('sellingAs')}</dt><dd>${t(p.mode === 'fixed' ? 'modeFixed' : 'modeQuote')} · ${t('moqN', { n: p.moq, u: p.unit })}</dd><dt>${t('priceLbl')}</dt><dd>${gbp(p.price_pence)} / ${p.unit}</dd><dt>${t('shipsFrom')}</dt><dd>${dt(p.ships_from, lang)}</dd><dt>${t('weight')}</dt><dd>${p.weight_g} g</dd><dt>${t('stock')}</dt><dd>${p.stock}</dd>
      <dt>${t('descEn')}</dt><dd>${p.description}</dd>${p.description_ta ? h`<dt>${t('descTa')}</dt><dd lang="ta">${p.description_ta}</dd>` : ''}<dt>${t('certificate')}</dt><dd>${p.cert_id ? h`<a class="doc" href="/files/${p.cert_id}" target="_blank" rel="noopener">📄 ${t('viewCert')}</a>` : '—'}</dd></dl>
    <div class="flash ${d.rule.ok ? '' : 'warn'}"><b>${t('ukCheck')}:</b> ${t(d.rule.key)}</div></div>
    ${p.status === 'review' ? h`<aside class="card pad stack sticky"><form method="post" action="/admin/products/${p.id}/approve">${csrfField(ctx)}<button class="btn navy">${t('approvePublish')}</button></form>
      <form method="post" action="/admin/products/${p.id}/return" class="stack">${csrfField(ctx)}<label class="f">${t('reviewNote')}<textarea name="reason" required maxlength="500"></textarea></label><button class="btn">${t('sendBack')}</button></form></aside>` : h`<aside class="card pad">${chip(ctx, p.status)}</aside>`}</section>`;
}
function adminSuppliers(ctx, d) {
  const { t, lang } = ctx;
  return h`<section><h1>${t('adminH')}</h1></section>${adminTabs(ctx, 'suppliers')}<section class="card tw"><table><thead><tr><th>${t('supplier')}</th><th>${t('type')}</th><th>${t('district')}</th><th class="r">${t('products')}</th><th class="r">${t('salesTotal')}</th><th>${t('status')}</th><th></th></tr></thead><tbody>
    ${d.list.map((s) => h`<tr><td><div class="row nowrap">${avatar(s)}<div><b>${s.name}</b><div class="tiny muted">${s.contact_email || ''}</div></div></div></td><td>${dt(s.type, lang)}</td><td>${dt(s.district, lang)}</td><td class="r">${s.products}</td><td class="r">${gbp(s.sales)}</td><td>${chip(ctx, s.status)}</td>
      <td>${s.status === 'suspended' ? postBtn(ctx, `/admin/suppliers/${s.id}/reinstate`, t('reinstate')) : postBtn(ctx, `/admin/suppliers/${s.id}/suspend`, t('suspend'), 'ghost')}</td></tr>`)}</tbody></table></section>`;
}
function adminOrders(ctx, d) {
  const { t, lang } = ctx;
  return h`<section><h1>${t('adminH')}</h1></section>${adminTabs(ctx, 'orders')}<section class="card tw"><table><thead><tr><th>${t('orderRef')}</th><th>${t('date')}</th><th>${t('buyer')}</th><th>${t('deliverTo')}</th><th class="r">${t('goods')}</th><th class="r">${t('delivery')}</th><th class="r">${t('vatShort')}</th><th class="r">${t('total')}</th><th>${t('status')}</th></tr></thead><tbody>
    ${d.list.map((o) => h`<tr><td class="num"><a href="/orders/${o.ref}">${o.ref}</a></td><td>${dateLabel(o.created_at, lang)}</td><td>${o.name}<div class="tiny muted">${o.email}</div></td><td>${dt(o.country, lang)}${o.request_id ? h`<div class="tiny muted">${t('fromQuote')}</div>` : ''}</td><td class="r">${gbp(o.goods_pence)}</td><td class="r">${gbp(o.shipping_pence)}</td><td class="r">${gbp(o.vat_pence)}</td><td class="r"><b>${gbp(o.total_pence)}</b></td><td>${chip(ctx, o.status, 'os_')}</td></tr>`)}
    ${d.list.length ? '' : h`<tr><td colspan="9" class="empty">${t('noOrders')}</td></tr>`}</tbody></table></section>`;
}
function adminSettings(ctx, d) {
  const { t } = ctx;
  return h`<section><h1>${t('adminH')}</h1></section>${adminTabs(ctx, 'settings')}<form class="card pad form measure-w" method="post" action="/admin/settings">${csrfField(ctx)}<h3>${t('commission')}</h3>
    <label class="f">${t('commissionPct')}<input name="commission_pct" type="number" min="0" max="50" step="0.5" value="${d.commission}"></label><p class="tiny muted">${t('commissionHelp')}</p>
    <h3>${t('taxH')}</h3><label class="check"><input type="checkbox" name="uk_small_vat" value="1"${d.ukSmallVat ? raw(' checked') : ''}> ${t('ukSmallVatLbl')}</label><p class="tiny muted">${t('ukSmallVatHelp')}</p>
    <div><button class="btn navy">${t('save')}</button></div></form>`;
}


function settings(ctx, d) {
  const { t, lang } = ctx; const s = d.supplier; const v = d.values || {};
  return h`${head(ctx, s)}${tabs(ctx, 'settings')}
  <form class="card pad form measure-w" method="post" action="/dashboard/settings">${csrfField(ctx)}${errors(ctx, d.errors)}
    <h3>${t('shipsFrom')}: ${dt(s.ships_from, lang)}</h3><p class="tiny muted">${t('shipsFromFixed')}</p>
    <h3>${t('deliveryCharges')}</h3><p class="small muted">${t('deliveryChargesHelp')}</p>
    <div class="zones">${ZONES.map((z, i) => h`<label class="f">${t('zone_' + i)}<input name="zone_${i}" inputmode="decimal" placeholder="${t('noDelivery')}" value="${v['zone_' + i] ?? (d.delivery[z] !== undefined ? (d.delivery[z] / 100).toFixed(2) : '')}"></label>`)}</div>
    <p class="tiny muted">${t('zeroFree')}</p>
    <h3>WhatsApp</h3><label class="f">${t('waNumber')}<input name="whatsapp" value="${v.whatsapp ?? (s.whatsapp ? '+' + s.whatsapp : '')}" placeholder="+94 77…" inputmode="tel"><span class="tiny muted">${t('waSupplierHelp')}</span></label>
    ${d.waConfigured ? '' : h`<p class="tiny warn-t">${t('waNotLive')}</p>`}
    <div><button class="btn navy">${t('save')}</button></div></form>`;
}
function adminRequests(ctx, d) {
  const { t, lang } = ctx;
  return h`<section><h1>${t('adminH')}</h1></section>${adminTabs(ctx, 'requests')}<section class="card tw"><table><thead><tr><th>Ref</th><th>${t('product')}</th><th>${t('supplier')}</th><th>${t('buyer')}</th><th>${t('deliverTo')}</th><th class="r">${t('quantity')}</th><th class="r">${t('nav_messages')}</th><th>${t('status')}</th></tr></thead><tbody>
    ${d.list.map((r) => h`<tr><td class="num"><a href="/messages/${r.ref}">${r.ref}</a></td><td>${r.product_name}</td><td>${r.supplier_name}</td><td>${r.buyer_name}</td><td>${dt(r.country, lang)}</td><td class="r">${r.qty}</td><td class="r">${r.msgs}</td><td>${t('rq_' + r.status)}</td></tr>`)}
    ${d.list.length ? '' : h`<tr><td colspan="8" class="empty">${t('noMessages')}</td></tr>`}</tbody></table></section>`;
}
function adminWhatsapp(ctx, d) {
  const { t, lang } = ctx;
  return h`<section><h1>${t('adminH')}</h1></section>${adminTabs(ctx, 'whatsapp')}
  <div class="flash ${d.configured ? 'good' : 'warn'}">${d.configured ? t('waLive') : t('waNotLiveAdmin')}</div>
  <section class="card tw"><table><thead><tr><th>${t('date')}</th><th></th><th>${t('phone')}</th><th>${t('message')}</th><th>${t('status')}</th></tr></thead><tbody>
    ${d.list.map((m) => h`<tr><td class="tiny">${dateLabel(m.created_at, lang)} ${m.created_at.slice(11, 16)}</td><td>${m.direction === 'in' ? '⬅' : '➡'}</td><td class="num tiny">+${m.phone.slice(0, -4).replace(/\d/g, '•')}${m.phone.slice(-4)}</td><td class="small pre">${m.body}</td><td class="tiny">${m.status}</td></tr>`)}
    ${d.list.length ? '' : h`<tr><td colspan="5" class="empty">${t('waEmpty')}</td></tr>`}</tbody></table></section>`;
}

module.exports = { settings, adminRequests, adminWhatsapp, dashboard, productList, productForm, orders, payouts, admin, adminApplication, adminProduct, adminSuppliers, adminOrders, adminSettings };
