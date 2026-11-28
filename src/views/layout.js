'use strict';
const { h, raw } = require('../util');
const { dt, CATEGORIES } = require('../i18n');

function layout(ctx, { title, body, active = '' }) {
  const { t, lang, user, csrf, flash } = ctx;
  const isSupplier = user && user.suppliers.some((s) => s.status === 'verified');
  const nav = [['/', 'nav_home', 'home'], ['/products', 'nav_products', 'products'], ['/suppliers', 'nav_suppliers', 'suppliers']];
  if (user) nav.push(['/messages', 'nav_messages', 'messages'], ['/orders', 'nav_orders', 'orders']);
  nav.push(isSupplier ? ['/dashboard', 'nav_dashboard', 'dashboard'] : ['/sell', 'nav_sell', 'sell']);
  if (user && user.role === 'admin') nav.push(['/admin', 'nav_admin', 'admin']);
  const back = encodeURIComponent(ctx.url.pathname + ctx.url.search);
  return h`<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? title + ' · ' : ''}${t('brand')}</title>
<meta name="description" content="${t('metaDescription')}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Figtree:wght@400;500;600;700&family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/styles.css">
</head>
<body>
${process.env.DEMO_MODE === '1' ? h`<div class="demo">${t('demoBanner')}</div>` : ''}
<header class="top"><div class="top-in">
  <a class="logo" href="/"><span><b>${t('brand')}</b><small>${t('tagline')}</small></span></a>
  <form class="tsearch" action="/products" method="get" role="search"><label class="sr" for="tcat">${t('category')}</label><select id="tcat" name="category"><option value="">${t('all')}</option>${CATEGORIES.map((c) => h`<option value="${c}">${dt(c, lang)}</option>`)}</select><label class="sr" for="tq">${t('searchLbl')}</label><input id="tq" name="q" placeholder="${t('searchPh')}"><button>${t('search')}</button></form>
  <div class="tools">
    <div class="lang" role="group" aria-label="Language / மொழி"><a href="/lang/en?back=${raw(back)}" class="${lang === 'en' ? 'on' : ''}">English</a><a href="/lang/ta?back=${raw(back)}" class="${lang === 'ta' ? 'on' : ''}">தமிழ்</a></div>
    <form class="ctry" method="get" action="/country"><input type="hidden" name="back" value="${ctx.url.pathname + ctx.url.search}"><label class="sr" for="ctry">${t('deliverTo')}</label><span class="tiny">${t('deliverTo')}</span><select id="ctry" name="c">${ctx.countries.map((c) => h`<option value="${c}"${c === ctx.country ? raw(' selected') : ''}>${dt(c, lang)}</option>`)}</select><button class="go">${t('go')}</button></form>
    <a class="cartbtn" href="/cart">${t('cart')}<b>${ctx.cartCount || 0}</b></a>
  </div>
</div></header>
<nav class="subnav"><div class="subnav-in">${nav.map(([href, key, id]) => h`<a href="${href}" class="${active === id ? 'on' : ''}">${t(key)}${id === 'messages' && ctx.openRequests ? h` <b class="badge">${ctx.openRequests}</b>` : ''}</a>`)}
  <span class="push"></span>${user ? h`<form method="post" action="/logout" class="inline">${raw(`<input type="hidden" name="_csrf" value="${csrf}">`)}<span class="small muted">${user.name}</span> <button class="btn sm ghost">${t('logout')}</button></form>` : h`<a href="/login">${t('login')}</a>`}
</div></nav>
<main id="main">${flash ? h`<div class="flash ${flash.kind || ''}" role="status">${flash.msg}</div>` : ''}${body}</main>
<footer class="foot">${t('footer')}</footer>
</body></html>`;
}

module.exports = { layout };
