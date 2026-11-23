'use strict';
const { h, gbp, dateLabel } = require('../util');
const { dt } = require('../i18n');
const { L, avatar, csrfField, postBtn, productImg } = require('./parts');
const { dutyBox } = require('./pages');

const stChip = (ctx, s) => h`<span class="chip ${s === 'quoted' || s === 'accepted' ? 'amber' : s === 'paid' ? 'good' : s === 'closed' ? 'plain' : 'navyc'}">${ctx.t('rq_' + s)}</span>`;
const when = (iso, lang) => `${dateLabel(iso, lang)} ${iso.slice(11, 16)}`;

function inbox(ctx, d) {
  const { t, lang } = ctx;
  return h`<section><h1>${t('messagesH')}</h1><p class="muted small">${t('messagesP')}</p></section>
  <section class="card">${d.list.map((r) => h`<a class="queue-item plain" href="/messages/${r.ref}"><div class="stack6 grow"><div class="row"><b>${L(r, 'product_name', lang)}</b>${stChip(ctx, r.status)}<span class="tiny muted num">${r.ref}</span></div>
      <span class="small muted">${r.role === 'buyer' ? t('withSupplier', { s: r.supplier_name }) : t('fromBuyer', { b: r.buyer_name })} · ${r.qty} · ${dt(r.country, lang)}</span>
      ${r.last ? h`<span class="small clip">${r.last}</span>` : ''}</div><span class="tiny muted">${dateLabel(r.updated_at, lang)}</span></a>`)}
    ${d.list.length ? '' : h`<div class="empty">${t('noMessages')} <a href="/products">${t('browse')}</a></div>`}</section>`;
}

function quoteCard(ctx, q, r, role, expired) {
  const { t, lang } = ctx; const total = q.goods_pence + q.shipping_pence + q.handling_pence;
  const live = q.status === 'offered' && !expired(q) && r.status === 'quoted';
  return h`<div class="quote ${live ? 'live' : ''}"><div class="row between"><b>${t('quoteFor', { n: q.qty, u: r.unit })}</b><span class="chip ${q.status === 'accepted' ? 'good' : live ? 'amber' : 'plain'}">${live ? t('q_offered') : expired(q) && q.status === 'offered' ? t('q_expired') : t('q_' + q.status)}</span></div>
    <table class="small"><tbody><tr><td>${t('goods')}</td><td class="r">${gbp(q.goods_pence)}</td></tr><tr><td>${t('shippingFromLK', { c: dt(r.ships_from, lang) })}</td><td class="r">${gbp(q.shipping_pence)}</td></tr>${q.handling_pence ? h`<tr><td>${t('handling')}</td><td class="r">${gbp(q.handling_pence)}</td></tr>` : ''}<tr><td><b>${t('deliveredTo', { c: dt(r.country, lang) })}</b></td><td class="r"><b>${gbp(total)}</b></td></tr></tbody></table>
    <div class="tiny muted">${t('perUnit', { p: gbp(Math.round(total / q.qty)) })} · ${t('validUntil', { d: dateLabel(q.valid_until + 'T00:00:00Z', lang) })}</div>
    ${q.note ? h`<p class="small">${q.note}</p>` : ''}
    ${live && role === 'buyer' ? h`<a class="btn buy" href="/messages/${r.ref}/quotes/${q.id}/accept">${t('acceptPay')}</a>` : ''}</div>`;
}

function bubble(ctx, m, d) {
  const { t, lang } = ctx; const r = d.request;
  if (m.sender === 'system') {
    const [kind, a, b] = m.body.split('|');
    if (kind === 'quote') { const q = d.quotes.find((x) => x.id === Number(a)); return q ? h`<div class="sys">${quoteCard(ctx, q, r, d.role, d.expired)}</div>` : ''; }
    const text = kind === 'request' ? t('sysRequest', { n: a, u: r.unit, c: dt(b, lang) }) : kind === 'accepted' ? t('sysAccepted') : kind === 'paid' ? t('sysPaid', { r: a }) : kind === 'closed' ? t(a === 'buyer' ? 'sysClosedBuyer' : 'sysClosedSupplier') : m.body;
    return h`<div class="sys"><span class="tiny muted">${text} · ${when(m.created_at, lang)}</span></div>`;
  }
  const mine = m.sender === d.role;
  const who = m.sender === 'buyer' ? (m.user_name || r.buyer_name) : r.supplier_name;
  return h`<div class="msg ${mine ? 'me' : ''}"><div class="tiny muted">${who}${m.via === 'whatsapp' ? h` · <span class="wa">WhatsApp</span>` : ''} · ${when(m.created_at, lang)}</div><div class="bub">${m.body}</div></div>`;
}

function thread(ctx, d) {
  const { t, lang } = ctx; const r = d.request; const role = d.role;
  const canTalk = (role === 'buyer' || role === 'supplier') && r.status !== 'closed';
  const canQuote = role === 'supplier' && ['open', 'quoted'].includes(r.status);
  return h`<p class="tiny muted"><a href="/messages">${t('messagesH')}</a> › <span class="num">${r.ref}</span></p>
  <div class="split"><section class="card thread">
    <div class="pad row nowrap bb"><span class="thumbsm">${productImg(r)}</span><div class="grow"><b>${L(r, 'product_name', lang)}</b><div class="small muted">${role === 'buyer' ? r.supplier_name : t('fromBuyer', { b: r.buyer_name })} · ${r.qty} ${r.unit} → ${dt(r.country, lang)}</div></div>${stChip(ctx, r.status)}</div>
    <div class="msgs pad">${d.messages.map((m) => bubble(ctx, m, d))}<span id="end"></span></div>
    ${canTalk ? h`<form method="post" action="/messages/${r.ref}" class="pad bt row nowrap top">${csrfField(ctx)}<label class="sr" for="mb">${t('message')}</label><textarea id="mb" name="body" required maxlength="2000" placeholder="${t('messagePh')}" class="grow"></textarea><button class="btn navy">${t('send')}</button></form>
      <p class="tiny muted pad pt0">${t('keepOnSite')}</p>` : ''}
  </section>
  <aside class="stack sticky">
    <div class="card pad stack"><h3>${t('requestDetails')}</h3>
      <dl class="kv"><dt>${t('quantity')}</dt><dd>${r.qty} ${r.unit}</dd><dt>${t('deliverTo')}</dt><dd>${dt(r.country, lang)}</dd><dt>${t('guidePrice')}</dt><dd>${gbp(r.guide_pence)} / ${r.unit} · ${t('moqN', { n: r.moq, u: r.unit })}</dd><dt>${t('shipsFrom')}</dt><dd>${dt(r.ships_from, lang)}</dd></dl>
      ${d.order ? h`<a class="btn" href="/orders/${d.order.ref}">${t('viewOrder', { r: d.order.ref })}</a>` : ''}
      ${dutyBox(ctx, d.dutyKey)}</div>
    ${canQuote ? h`<form class="card pad form" method="post" action="/messages/${r.ref}/quote">${csrfField(ctx)}<h3>${d.quotes.some((q) => q.status === 'offered') ? t('updateQuote') : t('sendQuote')}</h3>
      <p class="tiny muted">${t('quoteHelp', { c: dt(r.country, lang) })}</p>
      <div class="f2"><label class="f">${t('quantity')}<input name="qty" type="number" min="1" value="${r.qty}" required></label><label class="f">${t('goodsTotal')}<input name="goods" inputmode="decimal" required placeholder="£"></label></div>
      <div class="f2"><label class="f">${t('shippingTo', { c: dt(r.country, lang) })}<input name="shipping" inputmode="decimal" required placeholder="£"></label><label class="f">${t('handling')}<input name="handling" inputmode="decimal" placeholder="£0"></label></div>
      <label class="f">${t('validDays')}<input name="valid_days" type="number" min="1" max="30" value="7"></label>
      <label class="f">${t('quoteNoteLbl')}<textarea name="note" maxlength="500" placeholder="${t('quoteNoteSupplierPh')}"></textarea></label>
      <button class="btn buy">${t('sendQuote')}</button></form>` : ''}
    ${(role === 'buyer' || role === 'supplier') && ['open', 'quoted'].includes(r.status) ? h`<div class="card pad">${postBtn(ctx, `/messages/${r.ref}/close`, t('closeRequest'), 'ghost')}</div>` : ''}
  </aside></div>`;
}

module.exports = { inbox, thread };
