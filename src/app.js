'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Raw, toPence, nowIso, token, ref, slugify, isEmail, clean, RATE_LKR_PER_GBP } = require('./util');
const { makeT, dt, CATEGORIES, TYPES, DISTRICTS } = require('./i18n');
const auth = require('./auth');
const { parseMultipart, checkFile } = require('./multipart');
const { quote } = require('./pricing');
const { audit, setting } = require('./db');
const { layout } = require('./views/layout');
const P = require('./views/pages');
const M = require('./views/manage');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const STATIC_TYPES = { '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.js': 'text/javascript; charset=utf-8' };
const MAX_FORM = 1024 * 1024; const MAX_UPLOAD = 25 * 1024 * 1024;
const dtTa = (s) => dt(s, 'ta');
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const provider = () => {
  const name = process.env.PAYMENT_PROVIDER || 'test';
  if (name !== 'test') throw new Error('Only the test payment provider is available until DPayments is connected.');
  return { name, testMode: true, confirm: (o) => ({ ok: true, providerRef: 'test_' + o.ref }) };
};

function createApp(db) {
  const routes = [];
  const route = (method, pattern, handler) => { const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$'); routes.push({ method, re, keys, handler }); };

  /* ---------------- helpers ---------------- */
  const secure = (req) => req.headers['x-forwarded-proto'] === 'https';
  const send = (ctx, status, body) => { ctx.res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': ctx.cookies }); ctx.res.end(body instanceof Raw ? body.s : String(body)); };
  const page = (ctx, opts, status = 200) => send(ctx, status, layout(ctx, opts));
  const redirect = (ctx, loc, flash) => {
    if (flash) ctx.cookies.push(auth.cookie('flash', JSON.stringify(flash), { maxAge: 60, secure: secure(ctx.req) }));
    ctx.res.writeHead(303, { Location: loc, 'Set-Cookie': ctx.cookies, 'Cache-Control': 'no-store' }); ctx.res.end();
  };
  const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n : '/');
  const requireUser = (ctx) => { if (!ctx.user) { redirect(ctx, '/login?next=' + encodeURIComponent(ctx.url.pathname)); return false; } return true; };
  const mySupplier = (ctx) => {
    if (!requireUser(ctx)) return null;
    const s = ctx.user.suppliers.find((x) => x.status === 'verified');
    if (!s) { redirect(ctx, '/sell'); return null; }
    return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(s.id);
  };
  const requireAdmin = (ctx) => { if (!requireUser(ctx)) return false; if (ctx.user.role !== 'admin') throw new HttpError(403); return true; };
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const saveFile = (kind, ownerId, label, f) => Number(db.prepare(`INSERT INTO files (owner_kind, owner_id, label, filename, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(kind, ownerId, label, f.filename, f.mime, f.data.length, f.data, nowIso()).lastInsertRowid);
  const fileErr = (ctx, code, name) => ctx.t('file_' + code, { f: name });
  const commission = () => Number(setting(db, 'commission_pct') || 10);
  const PRODUCT_SQL = `SELECT p.*, s.name AS supplier_name, s.name_ta AS supplier_name_ta, s.slug AS supplier_slug FROM products p JOIN suppliers s ON s.id = p.supplier_id`;
  const LIVE = `p.status = 'live' AND s.status = 'verified'`;
  const supplierList = () => db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.status = 'live') AS products FROM suppliers s WHERE s.status = 'verified' ORDER BY s.name`).all();
  const matchSupplier = (s, q) => [s.name, s.name_ta, s.district, dtTa(s.district), s.type, dtTa(s.type), s.about, s.about_ta].join(' ').toLowerCase().includes(q);

  /* ---------------- cart ---------------- */
  const cartId = (ctx) => {
    if (!ctx.cartId) { ctx.cartId = token(); ctx.cookies.push(auth.cookie('cart', ctx.cartId, { maxAge: 30 * 86400, secure: secure(ctx.req) })); }
    return ctx.cartId;
  };
  const cartLines = (ctx) => (ctx.cartId ? db.prepare(`SELECT c.qty, p.id AS pid FROM cart_items c JOIN products p ON p.id = c.product_id JOIN suppliers s ON s.id = p.supplier_id WHERE c.cart_id = ? AND ${LIVE}`).all(ctx.cartId) : [])
    .map((l) => ({ qty: l.qty, product: db.prepare(`${PRODUCT_SQL} WHERE p.id = ?`).get(l.pid) }));

  /* ---------------- basics ---------------- */
  route('GET', '/lang/:code', (ctx) => { ctx.cookies.push(auth.cookie('lang', ctx.params.code === 'ta' ? 'ta' : 'en', { maxAge: 365 * 86400, secure: secure(ctx.req), httpOnly: false })); redirect(ctx, safeNext(ctx.query.get('back'))); });
  route('GET', '/healthz', (ctx) => { ctx.res.writeHead(200, { 'Content-Type': 'text/plain' }); ctx.res.end('ok'); });
  route('GET', '/robots.txt', (ctx) => { ctx.res.writeHead(200, { 'Content-Type': 'text/plain' }); ctx.res.end(process.env.DEMO_MODE === '1' ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nDisallow: /admin\nDisallow: /dashboard\nDisallow: /cart\nDisallow: /checkout\n'); });

  /* ---------------- catalogue ---------------- */
  route('GET', '/', (ctx) => {
    const top = db.prepare(`${PRODUCT_SQL} WHERE ${LIVE} ORDER BY p.sold DESC LIMIT 10`).all();
    const sl = supplierList();
    page(ctx, { active: 'home', body: P.home(ctx, { top, supplierList: sl.slice(0, 6), suppliers: sl.length, products: db.prepare(`SELECT COUNT(*) n FROM products p JOIN suppliers s ON s.id = p.supplier_id WHERE ${LIVE}`).get().n }) });
  });
  route('GET', '/products', (ctx) => {
    const qs = ctx.query;
    const f = { q: clean(qs.get('q'), 80), category: CATEGORIES.includes(qs.get('category')) ? qs.get('category') : '', supplier: clean(qs.get('supplier'), 80), max: clean(qs.get('max'), 10), sort: ['popular', 'low', 'high', 'new'].includes(qs.get('sort')) ? qs.get('sort') : 'popular', instock: qs.get('instock') === '1' };
    let list = db.prepare(`${PRODUCT_SQL} WHERE ${LIVE}`).all();
    if (f.category) list = list.filter((p) => p.category === f.category);
    if (f.supplier) list = list.filter((p) => p.supplier_slug === f.supplier);
    const max = toPence(f.max); if (f.max && max > 0) list = list.filter((p) => p.price_pence <= max);
    if (f.instock) list = list.filter((p) => p.stock > 0);
    let supplierHits = [];
    if (f.q) {
      const q = f.q.toLowerCase();
      list = list.filter((p) => [p.name, p.name_ta, p.description, p.description_ta, p.category, dtTa(p.category), p.supplier_name, p.supplier_name_ta, p.hs_code].join(' ').toLowerCase().includes(q));
      supplierHits = supplierList().filter((s) => matchSupplier(s, q)).slice(0, 6);
    }
    const sorters = { popular: (a, b) => b.sold - a.sold, low: (a, b) => a.price_pence - b.price_pence, high: (a, b) => b.price_pence - a.price_pence, new: (a, b) => b.id - a.id };
    list.sort(sorters[f.sort]);
    page(ctx, { title: ctx.t('allProducts'), active: 'products', body: P.products(ctx, { list, filters: f, suppliers: supplierList(), supplierHits }) });
  });
  route('GET', '/products/:id', (ctx) => {
    const p = db.prepare(`${PRODUCT_SQL} WHERE p.id = ? AND ${LIVE}`).get(Number(ctx.params.id)); if (!p) throw new HttpError(404);
    const s = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(p.supplier_id);
    const qty = Math.max(1, Math.min(p.stock || 1, Math.round(Number(ctx.query.get('qty')) || 1)));
    const more = db.prepare(`${PRODUCT_SQL} WHERE p.supplier_id = ? AND p.id != ? AND ${LIVE} ORDER BY p.sold DESC LIMIT 5`).all(p.supplier_id, p.id);
    page(ctx, { title: (ctx.lang === 'ta' && p.name_ta) || p.name, active: 'products', body: P.product(ctx, { product: p, supplier: s, qty, quote: quote([{ product: p, qty }]), more }) });
  });
  route('GET', '/suppliers', (ctx) => {
    const qs = ctx.query; const f = { q: clean(qs.get('q'), 80), type: TYPES.includes(qs.get('type')) ? qs.get('type') : '', category: CATEGORIES.includes(qs.get('category')) ? qs.get('category') : '' };
    let list = supplierList();
    if (f.type) list = list.filter((s) => s.type === f.type);
    if (f.category) list = list.filter((s) => db.prepare(`SELECT 1 FROM products WHERE supplier_id = ? AND category = ? AND status = 'live'`).get(s.id, f.category));
    if (f.q) { const q = f.q.toLowerCase(); list = list.filter((s) => matchSupplier(s, q)); }
    page(ctx, { title: ctx.t('suppliersH'), active: 'suppliers', body: P.suppliers(ctx, { list, filters: f }) });
  });
  route('GET', '/suppliers/:slug', (ctx) => {
    const s = db.prepare(`SELECT * FROM suppliers WHERE slug = ? AND status = 'verified'`).get(ctx.params.slug); if (!s) throw new HttpError(404);
    page(ctx, { title: s.name, active: 'suppliers', body: P.supplier(ctx, { supplier: s, products: db.prepare(`${PRODUCT_SQL} WHERE p.supplier_id = ? AND ${LIVE} ORDER BY p.sold DESC`).all(s.id) }) });
  });

  /* ---------------- files ---------------- */
  route('GET', '/files/:id', (ctx) => {
    const f = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(ctx.params.id)); if (!f) throw new HttpError(404);
    let ok = ctx.user && ctx.user.role === 'admin';
    if (f.owner_kind === 'product') {
      const p = db.prepare(`SELECT p.status, p.supplier_id, s.status AS sstatus FROM products p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`).get(f.owner_id);
      if (p && p.status === 'live' && p.sstatus === 'verified') ok = true;
      if (p && ctx.user && ctx.user.suppliers.some((x) => x.id === p.supplier_id)) ok = true;
    } else if (f.owner_kind === 'application') {
      const a = db.prepare('SELECT user_id FROM applications WHERE id = ?').get(f.owner_id); if (a && ctx.user && a.user_id === ctx.user.id) ok = true;
    }
    if (!ok) throw new HttpError(ctx.user ? 403 : 404);
    ctx.res.writeHead(200, { 'Content-Type': f.mime, 'Content-Length': f.data.length, 'Content-Disposition': `inline; filename="${f.filename.replace(/[^\w.\-]+/g, '_')}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox", 'Cache-Control': 'private, max-age=300', 'Set-Cookie': ctx.cookies });
    ctx.res.end(Buffer.from(f.data));
  });

  /* ---------------- cart and checkout ---------------- */
  route('POST', '/cart/add', (ctx) => {
    const p = db.prepare(`${PRODUCT_SQL} WHERE p.id = ? AND ${LIVE}`).get(Number(ctx.body.product_id)); if (!p) throw new HttpError(404);
    const qty = Math.max(1, Math.round(Number(ctx.body.qty) || 1)); const id = cartId(ctx);
    const cur = (db.prepare('SELECT qty FROM cart_items WHERE cart_id = ? AND product_id = ?').get(id, p.id) || { qty: 0 }).qty;
    const next = Math.min(p.stock, cur + qty);
    if (next < 1) return redirect(ctx, `/products/${p.id}`, { kind: 'bad', msg: ctx.t('outOfStockP') });
    db.prepare('INSERT INTO cart_items (cart_id, product_id, qty) VALUES (?, ?, ?) ON CONFLICT(cart_id, product_id) DO UPDATE SET qty = excluded.qty').run(id, p.id, next);
    redirect(ctx, '/cart', { kind: 'good', msg: ctx.t('addedToCart') });
  });
  route('POST', '/cart/update', (ctx) => {
    if (!ctx.cartId) return redirect(ctx, '/cart');
    const pid = Number(ctx.body.product_id); const qty = Math.max(0, Math.round(Number(ctx.body.qty) || 0));
    if (qty === 0) db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?').run(ctx.cartId, pid);
    else db.prepare('UPDATE cart_items SET qty = ? WHERE cart_id = ? AND product_id = ?').run(qty, ctx.cartId, pid);
    redirect(ctx, '/cart');
  });
  const cartView = (ctx) => {
    const lines = cartLines(ctx); const groups = new Map();
    for (const l of lines) { if (!groups.has(l.product.supplier_id)) groups.set(l.product.supplier_id, { supplier: db.prepare('SELECT * FROM suppliers WHERE id = ?').get(l.product.supplier_id), lines: [] }); groups.get(l.product.supplier_id).lines.push(l); }
    return { lines, groups: [...groups.values()], quote: quote(lines), problems: lines.some((l) => l.qty > l.product.stock) };
  };
  route('GET', '/cart', (ctx) => page(ctx, { title: ctx.t('cart'), body: P.cart(ctx, cartView(ctx)) }));
  route('GET', '/checkout', (ctx) => {
    const v = cartView(ctx); if (!v.lines.length || v.problems) return redirect(ctx, '/cart');
    page(ctx, { title: ctx.t('checkout'), body: P.checkout(ctx, { quote: v.quote, values: ctx.user ? { name: ctx.user.name, email: ctx.user.email } : {} }) });
  });
  route('POST', '/checkout', (ctx) => {
    const v = cartView(ctx); if (!v.lines.length || v.problems) return redirect(ctx, '/cart');
    const b = ctx.body; const o = { name: clean(b.name, 120), email: clean(b.email, 200), phone: clean(b.phone, 30), address1: clean(b.address1, 160), address2: clean(b.address2, 160), city: clean(b.city, 80), postcode: clean(b.postcode, 10).toUpperCase() };
    const errs = [];
    if (!o.name || !o.address1 || !o.city) errs.push(ctx.t('required'));
    if (!isEmail(o.email)) errs.push(ctx.t('errEmail'));
    if (!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(o.postcode)) errs.push(ctx.t('errPostcode'));
    if (errs.length) return page(ctx, { body: P.checkout(ctx, { quote: v.quote, values: b, errors: errs }) }, 400);
    const q = v.quote; const r = ref('KT');
    tx(() => {
      const oid = Number(db.prepare(`INSERT INTO orders (ref, user_id, name, email, phone, address1, address2, city, postcode, country, goods_pence, shipping_pence, duty_pence, vat_pence, total_pence, status, provider, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UK', ?, ?, ?, ?, ?, 'pending', ?, ?)`).run(r, ctx.user ? ctx.user.id : null, o.name, o.email, o.phone || null, o.address1, o.address2 || null, o.city, o.postcode, q.goods, q.shipping, q.duty, q.vat, q.total, provider().name, nowIso()).lastInsertRowid);
      for (const l of v.lines) db.prepare('INSERT INTO order_items (order_id, supplier_id, product_id, name, price_pence, qty) VALUES (?, ?, ?, ?, ?, ?)').run(oid, l.product.supplier_id, l.product.id, l.product.name, l.product.price_pence, l.qty);
      for (const parcel of q.parcels) db.prepare(`INSERT INTO shipments (order_id, supplier_id, status, shipping_pence, goods_pence, updated_at) VALUES (?, ?, 'pending', ?, ?, ?)`).run(oid, parcel.supplier_id, parcel.shipping, parcel.goods, nowIso());
    });
    redirect(ctx, `/pay/${r}`);
  });
  const orderByRef = (r) => db.prepare('SELECT * FROM orders WHERE ref = ?').get(String(r));
  route('GET', '/pay/:ref', (ctx) => { const o = orderByRef(ctx.params.ref); if (!o) throw new HttpError(404); if (o.status === 'paid') return redirect(ctx, `/orders/${o.ref}`); page(ctx, { title: ctx.t('payment'), body: P.pay(ctx, { order: o, testMode: provider().testMode }) }); });
  route('POST', '/pay/:ref', (ctx) => {
    const o = orderByRef(ctx.params.ref); if (!o) throw new HttpError(404);
    if (o.status === 'paid') return redirect(ctx, `/orders/${o.ref}`);
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
    for (const i of items) { const p = db.prepare('SELECT stock FROM products WHERE id = ?').get(i.product_id); if (!p || p.stock < i.qty) return redirect(ctx, '/cart', { kind: 'bad', msg: ctx.t('fixStock') }); }
    const res = provider().confirm(o);
    if (!res.ok) return redirect(ctx, `/pay/${o.ref}`, { kind: 'bad', msg: ctx.t('payFailed') });
    tx(() => {
      if (db.prepare(`UPDATE orders SET status = 'paid', provider_ref = ?, paid_at = ? WHERE id = ? AND status = 'pending'`).run(res.providerRef, nowIso(), o.id).changes !== 1) return;
      for (const i of items) db.prepare('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?').run(i.qty, i.qty, i.product_id);
      db.prepare(`UPDATE shipments SET status = 'paid', updated_at = ? WHERE order_id = ?`).run(nowIso(), o.id);
      if (ctx.cartId) db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(ctx.cartId);
    });
    ctx.cookies.push(auth.cookie('justpaid', o.ref, { maxAge: 120, secure: secure(ctx.req) }));
    redirect(ctx, `/orders/${o.ref}`);
  });
  route('GET', '/orders/:ref', (ctx) => {
    const o = orderByRef(ctx.params.ref); if (!o) throw new HttpError(404);
    const mine = (ctx.user && (o.user_id === ctx.user.id || ctx.user.role === 'admin')) || ctx.rawCookies.justpaid === o.ref || ctx.rawCookies['ord_' + o.id] === '1';
    if (!mine) throw new HttpError(404);
    if (ctx.rawCookies.justpaid === o.ref) ctx.cookies.push(auth.cookie('ord_' + o.id, '1', { maxAge: 30 * 86400, secure: secure(ctx.req) }));
    const shipments = db.prepare('SELECT * FROM shipments WHERE order_id = ? ORDER BY id').all(o.id).map((s) => ({ ...s, supplier: db.prepare('SELECT * FROM suppliers WHERE id = ?').get(s.supplier_id), items: db.prepare('SELECT * FROM order_items WHERE order_id = ? AND supplier_id = ?').all(o.id, s.supplier_id) }));
    page(ctx, { title: o.ref, active: 'orders', body: P.orderPage(ctx, { order: o, shipments, justPaid: ctx.rawCookies.justpaid === o.ref }) });
  });
  route('GET', '/orders', (ctx) => { if (!requireUser(ctx)) return; page(ctx, { title: ctx.t('myOrders'), active: 'orders', body: P.orders(ctx, { list: db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(ctx.user.id) }) }); });

  /* ---------------- accounts ---------------- */
  const startSession = (ctx, uid) => { const s = auth.createSession(db, uid); ctx.cookies.push(auth.cookie('sid', s.id, { maxAge: s.maxAge, secure: secure(ctx.req) })); };
  route('GET', '/login', (ctx) => page(ctx, { title: ctx.t('login'), body: P.login(ctx, { next: safeNext(ctx.query.get('next') || '/') }) }));
  route('POST', '/login', (ctx) => {
    const email = clean(ctx.body.email, 200).toLowerCase(); const next = safeNext(ctx.body.next);
    if (auth.throttled('login:' + ctx.ip + ':' + email)) return page(ctx, { body: P.login(ctx, { email, next, errors: [ctx.t('errThrottle')] }) }, 429);
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u || !auth.verifyPassword(ctx.body.password, u.password_hash)) return page(ctx, { body: P.login(ctx, { email, next, errors: [ctx.t('errLogin')] }) }, 400);
    startSession(ctx, u.id); redirect(ctx, next);
  });
  route('GET', '/register', (ctx) => page(ctx, { title: ctx.t('register'), body: P.register(ctx, { next: safeNext(ctx.query.get('next') || '/') }) }));
  route('POST', '/register', (ctx) => {
    const b = ctx.body; const email = clean(b.email, 200).toLowerCase(); const name = clean(b.name, 120); const next = safeNext(b.next); const errs = [];
    if (auth.throttled('register:' + ctx.ip, 20)) errs.push(ctx.t('errThrottle'));
    if (!name) errs.push(ctx.t('errName')); if (!isEmail(email)) errs.push(ctx.t('errEmail')); if (String(b.password || '').length < 10) errs.push(ctx.t('errPassword'));
    if (!errs.length && db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) errs.push(ctx.t('errEmailTaken'));
    if (errs.length) return page(ctx, { body: P.register(ctx, { name, email, next, errors: errs }) }, 400);
    const id = Number(db.prepare(`INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, 'buyer', ?)`).run(email, name, auth.hashPassword(b.password), nowIso()).lastInsertRowid);
    startSession(ctx, id); redirect(ctx, next, { kind: 'good', msg: ctx.t('welcome', { n: name }) });
  });
  route('POST', '/logout', (ctx) => { auth.destroySession(db, ctx.sid); ctx.cookies.push(auth.cookie('sid', '', { maxAge: 0 })); redirect(ctx, '/'); });
  const adminExists = () => !!db.prepare(`SELECT 1 FROM users WHERE role = 'admin'`).get();
  route('GET', '/setup', (ctx) => { if (adminExists() || !process.env.SETUP_CODE) throw new HttpError(404); page(ctx, { title: ctx.t('setupH'), body: P.setup(ctx, {}) }); });
  route('POST', '/setup', (ctx) => {
    if (adminExists() || !process.env.SETUP_CODE) throw new HttpError(404);
    const b = ctx.body; const email = clean(b.email, 200).toLowerCase(); const name = clean(b.name, 120); const errs = [];
    const want = Buffer.from(process.env.SETUP_CODE); const got = Buffer.from(String(b.code || ''));
    if (auth.throttled('setup:' + ctx.ip, 5)) errs.push(ctx.t('errThrottle')); else if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) errs.push(ctx.t('errSetupCode'));
    if (!name) errs.push(ctx.t('errName')); if (!isEmail(email)) errs.push(ctx.t('errEmail')); if (String(b.password || '').length < 12) errs.push(ctx.t('errPasswordAdmin'));
    if (!errs.length && db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) errs.push(ctx.t('errEmailTaken'));
    if (errs.length) return page(ctx, { body: P.setup(ctx, { name, email, errors: errs }) }, 400);
    const id = Number(db.prepare(`INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)`).run(email, name, auth.hashPassword(b.password), nowIso()).lastInsertRowid);
    audit(db, id, 'setup-admin'); startSession(ctx, id); redirect(ctx, '/admin', { kind: 'good', msg: ctx.t('adminCreated') });
  });

  /* ---------------- sell: supplier application ---------------- */
  route('GET', '/sell', (ctx) => {
    ctx.commission = commission();
    if (!ctx.user) return page(ctx, { title: ctx.t('sellH'), active: 'sell', body: P.sellIntro(ctx) });
    const apps = db.prepare('SELECT * FROM applications WHERE user_id = ? ORDER BY id DESC').all(ctx.user.id);
    if (apps.length && ctx.query.get('new') !== '1') return page(ctx, { title: ctx.t('myApplications'), active: 'sell', body: P.sellStatus(ctx, { apps }) });
    page(ctx, { title: ctx.t('sellH'), active: 'sell', body: P.sellForm(ctx, { values: { contact: ctx.user.name, email: ctx.user.email } }) });
  });
  route('POST', '/sell', (ctx) => {
    if (!requireUser(ctx)) return; ctx.commission = commission();
    const b = ctx.body; const errs = [];
    const cats = [].concat(b.categories || []).filter((c) => CATEGORIES.includes(c));
    const v = { name: clean(b.name, 160), name_ta: clean(b.name_ta, 160), type: TYPES.includes(b.type) ? b.type : '', district: DISTRICTS.includes(b.district) ? b.district : '', br_no: clean(b.br_no, 60), contact: clean(b.contact, 120), email: clean(b.email, 200), phone: clean(b.phone, 30), about: clean(b.about, 1500), about_ta: clean(b.about_ta, 1500) };
    if (db.prepare(`SELECT 1 FROM applications WHERE user_id = ? AND status = 'pending'`).get(ctx.user.id)) errs.push(ctx.t('errPendingApp'));
    if (!v.name || !v.type || !v.district || !v.br_no || !v.contact || !v.about) errs.push(ctx.t('required'));
    if (!isEmail(v.email)) errs.push(ctx.t('errEmail'));
    if (!cats.length) errs.push(ctx.t('errCats'));
    if (!b.agree) errs.push(ctx.t('mustAgree'));
    const docs = {};
    for (const [field, label, req] of [['doc_br', 'br', true], ['doc_id', 'id', true], ['doc_bank', 'bank', true], ['doc_edb', 'edb', false]]) {
      const f = ctx.files.find((x) => x.field === field);
      if (!f) { if (req) errs.push(fileErr(ctx, 'missing', ctx.t({ br: 'docBr', id: 'docId', bank: 'docBank', edb: 'docEdb' }[label]))); continue; }
      const e = checkFile(f); if (e) errs.push(fileErr(ctx, e, f.filename)); else docs[label] = f;
    }
    if (errs.length) return page(ctx, { active: 'sell', body: P.sellForm(ctx, { values: { ...b, categories: cats }, errors: errs }) }, 400);
    tx(() => {
      const id = Number(db.prepare(`INSERT INTO applications (user_id, name, name_ta, type, district, br_no, contact, email, phone, categories, about, about_ta, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .run(ctx.user.id, v.name, v.name_ta || null, v.type, v.district, v.br_no, v.contact, v.email, v.phone || null, cats.join(','), v.about, v.about_ta || null, nowIso()).lastInsertRowid);
      for (const [label, f] of Object.entries(docs)) saveFile('application', id, label, f);
    });
    redirect(ctx, '/sell', { kind: 'good', msg: ctx.t('appSent') });
  });

  /* ---------------- supplier dashboard ---------------- */
  const n = (sql, ...a) => db.prepare(sql).get(...a).n;
  const shippedGoods = (sid) => n(`SELECT COALESCE(SUM(goods_pence),0) n FROM shipments WHERE supplier_id = ? AND status IN ('shipped','delivered')`, sid);
  route('GET', '/dashboard', (ctx) => {
    const s = mySupplier(ctx); if (!s) return; const pct = commission(); const gross = shippedGoods(s.id);
    page(ctx, { title: ctx.t('dashH'), active: 'dashboard', body: M.dashboard(ctx, { supplier: s, commission: pct,
      stats: { sales: n(`SELECT COALESCE(SUM(goods_pence),0) n FROM shipments WHERE supplier_id = ? AND status IN ('paid','packed','shipped','delivered')`, s.id),
        toShip: n(`SELECT COUNT(*) n FROM shipments WHERE supplier_id = ? AND status IN ('paid','packed')`, s.id),
        live: n(`SELECT COUNT(*) n FROM products WHERE supplier_id = ? AND status = 'live'`, s.id), review: n(`SELECT COUNT(*) n FROM products WHERE supplier_id = ? AND status = 'review'`, s.id),
        payout: gross - Math.round(gross * pct / 100) },
      lowStock: db.prepare(`SELECT * FROM products WHERE supplier_id = ? AND status = 'live' AND stock < 5 ORDER BY stock`).all(s.id) }) });
  });
  const myProducts = (s) => db.prepare(`${PRODUCT_SQL} WHERE p.supplier_id = ? ORDER BY p.id DESC`).all(s.id);
  route('GET', '/dashboard/products', (ctx) => { const s = mySupplier(ctx); if (!s) return; page(ctx, { title: ctx.t('tProducts'), active: 'dashboard', body: M.productList(ctx, { supplier: s, products: myProducts(s) }) }); });
  route('GET', '/dashboard/products/new', (ctx) => { const s = mySupplier(ctx); if (!s) return; page(ctx, { title: ctx.t('tAddProduct'), active: 'dashboard', body: M.productForm(ctx, { supplier: s, values: { lead_days: 7, unit: 'item' } }) }); });
  const ownProduct = (s, id) => { const p = db.prepare('SELECT * FROM products WHERE id = ? AND supplier_id = ?').get(Number(id), s.id); if (!p) throw new HttpError(404); return p; };
  const readProduct = (ctx, existing) => {
    const b = ctx.body; const errs = [];
    const v = { name: clean(b.name, 160), name_ta: clean(b.name_ta, 160), category: CATEGORIES.includes(b.category) ? b.category : '', hs_code: clean(b.hs_code, 12), unit: clean(b.unit, 20) || 'item', price: toPence(b.price), weight_g: Math.round(Number(b.weight_g)), stock: Math.round(Number(b.stock)), lead_days: Math.min(90, Math.max(1, Math.round(Number(b.lead_days)) || 7)), description: clean(b.description, 3000), description_ta: clean(b.description_ta, 3000) };
    if (!v.name || !v.category || !v.description) errs.push(ctx.t('required'));
    if (!/^\d{4}(\.\d{2}){0,2}$/.test(v.hs_code)) errs.push(ctx.t('errHs'));
    if (!(v.price >= 50 && v.price <= 1000000)) errs.push(ctx.t('errPrice'));
    if (!(v.weight_g >= 1 && v.weight_g <= 30000)) errs.push(ctx.t('errWeight'));
    if (!(v.stock >= 0 && v.stock <= 100000)) errs.push(ctx.t('errStock'));
    const photo = ctx.files.find((x) => x.field === 'photo'); const cert = ctx.files.find((x) => x.field === 'cert');
    if (photo) { const e = checkFile(photo, 'media'); if (e || photo.mime === 'video/mp4') errs.push(fileErr(ctx, e || 'bad_photo', photo.filename)); }
    if (cert) { const e = checkFile(cert); if (e) errs.push(fileErr(ctx, e, cert.filename)); }
    if (v.category === 'Gems' && !cert && !(existing && existing.cert_id)) errs.push(ctx.t('errCert'));
    return { v, errs, photo, cert };
  };
  route('POST', '/dashboard/products', (ctx) => {
    const s = mySupplier(ctx); if (!s) return;
    const { v, errs, photo, cert } = readProduct(ctx);
    if (errs.length) return page(ctx, { active: 'dashboard', body: M.productForm(ctx, { supplier: s, values: ctx.body, errors: errs }) }, 400);
    tx(() => {
      const id = Number(db.prepare(`INSERT INTO products (supplier_id, name, name_ta, category, description, description_ta, price_pence, weight_g, hs_code, unit, stock, lead_days, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'review', ?)`)
        .run(s.id, v.name, v.name_ta || null, v.category, v.description, v.description_ta || null, v.price, v.weight_g, v.hs_code, v.unit, v.stock, v.lead_days, nowIso()).lastInsertRowid);
      if (photo) db.prepare('UPDATE products SET photo_id = ? WHERE id = ?').run(saveFile('product', id, 'photo', photo), id);
      if (cert) db.prepare('UPDATE products SET cert_id = ? WHERE id = ?').run(saveFile('product', id, 'cert', cert), id);
    });
    redirect(ctx, '/dashboard/products', { kind: 'good', msg: ctx.t('productSent') });
  });
  route('GET', '/dashboard/products/:id', (ctx) => {
    const s = mySupplier(ctx); if (!s) return; const p = ownProduct(s, ctx.params.id);
    page(ctx, { title: p.name, active: 'dashboard', body: M.productForm(ctx, { supplier: s, product: p, values: { ...p, price: (p.price_pence / 100).toFixed(2) } }) });
  });
  route('POST', '/dashboard/products/:id', (ctx) => {
    const s = mySupplier(ctx); if (!s) return; const p = ownProduct(s, ctx.params.id);
    const { v, errs, photo, cert } = readProduct(ctx, p);
    if (errs.length) return page(ctx, { active: 'dashboard', body: M.productForm(ctx, { supplier: s, product: p, values: ctx.body, errors: errs }) }, 400);
    // Changes to what the product is (name, description, category, HS code, photo, certificate) go back to review; price, stock and timing do not.
    const listingChanged = v.name !== p.name || (v.name_ta || null) !== p.name_ta || v.description !== p.description || (v.description_ta || null) !== p.description_ta || v.category !== p.category || v.hs_code !== p.hs_code || photo || cert;
    let status = p.status;
    if (p.status === 'returned' || (listingChanged && ['live', 'hidden'].includes(p.status))) status = 'review';
    else if (ctx.body.hidden === '1' && p.status === 'live') status = 'hidden';
    else if (ctx.body.hidden !== '1' && p.status === 'hidden') status = 'live';
    tx(() => {
      db.prepare(`UPDATE products SET name = ?, name_ta = ?, category = ?, description = ?, description_ta = ?, price_pence = ?, weight_g = ?, hs_code = ?, unit = ?, stock = ?, lead_days = ?, status = ?, reason = CASE WHEN ? = 'review' THEN NULL ELSE reason END WHERE id = ?`)
        .run(v.name, v.name_ta || null, v.category, v.description, v.description_ta || null, v.price, v.weight_g, v.hs_code, v.unit, v.stock, v.lead_days, status, status, p.id);
      if (photo) db.prepare('UPDATE products SET photo_id = ? WHERE id = ?').run(saveFile('product', p.id, 'photo', photo), p.id);
      if (cert) db.prepare('UPDATE products SET cert_id = ? WHERE id = ?').run(saveFile('product', p.id, 'cert', cert), p.id);
    });
    redirect(ctx, '/dashboard/products', { kind: 'good', msg: ctx.t(status === 'review' && p.status !== 'review' ? 'productResent' : 'saved') });
  });
  route('GET', '/dashboard/orders', (ctx) => {
    const s = mySupplier(ctx); if (!s) return;
    const shipments = db.prepare(`SELECT sh.*, o.ref, o.name, o.address1, o.address2, o.city, o.postcode, o.paid_at AS created_at FROM shipments sh JOIN orders o ON o.id = sh.order_id WHERE sh.supplier_id = ? AND o.status = 'paid' ORDER BY CASE sh.status WHEN 'paid' THEN 0 WHEN 'packed' THEN 1 ELSE 2 END, o.paid_at DESC`).all(s.id)
      .map((x) => ({ ...x, items: db.prepare('SELECT * FROM order_items WHERE order_id = ? AND supplier_id = ?').all(x.order_id, s.id) }));
    page(ctx, { title: ctx.t('tOrders'), active: 'dashboard', body: M.orders(ctx, { supplier: s, shipments }) });
  });
  route('POST', '/dashboard/shipments/:id/packed', (ctx) => {
    const s = mySupplier(ctx); if (!s) return;
    if (!db.prepare(`UPDATE shipments SET status = 'packed', updated_at = ? WHERE id = ? AND supplier_id = ? AND status = 'paid'`).run(nowIso(), Number(ctx.params.id), s.id).changes) throw new HttpError(404);
    redirect(ctx, '/dashboard/orders', { kind: 'good', msg: ctx.t('markedPacked') });
  });
  route('POST', '/dashboard/shipments/:id/shipped', (ctx) => {
    const s = mySupplier(ctx); if (!s) return; const tracking = clean(ctx.body.tracking, 80);
    if (!tracking) return redirect(ctx, '/dashboard/orders', { kind: 'bad', msg: ctx.t('errTracking') });
    if (!db.prepare(`UPDATE shipments SET status = 'shipped', tracking = ?, updated_at = ? WHERE id = ? AND supplier_id = ? AND status = 'packed'`).run(tracking, nowIso(), Number(ctx.params.id), s.id).changes) throw new HttpError(404);
    redirect(ctx, '/dashboard/orders', { kind: 'good', msg: ctx.t('markedShipped') });
  });
  route('GET', '/dashboard/payouts', (ctx) => {
    const s = mySupplier(ctx); if (!s) return; const pct = commission(); const gross = shippedGoods(s.id);
    page(ctx, { title: ctx.t('tPayouts'), active: 'dashboard', body: M.payouts(ctx, { supplier: s, gross, commission: pct, fee: Math.round(gross * pct / 100), rate: RATE_LKR_PER_GBP }) });
  });

  /* ---------------- admin ---------------- */
  route('GET', '/admin', (ctx) => {
    if (!requireAdmin(ctx)) return;
    const apps = db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM files f WHERE f.owner_kind = 'application' AND f.owner_id = a.id) docs FROM applications a WHERE status = 'pending' ORDER BY id`).all();
    const products = db.prepare(`${PRODUCT_SQL} WHERE p.status = 'review' ORDER BY p.id`).all();
    const shipped = n(`SELECT COALESCE(SUM(goods_pence),0) n FROM shipments WHERE status IN ('shipped','delivered')`);
    const stats = { suppliers: n(`SELECT COUNT(*) n FROM suppliers WHERE status = 'verified'`), gmv: n(`SELECT COALESCE(SUM(total_pence),0) n FROM orders WHERE status = 'paid'`), fees: Math.round(shipped * commission() / 100) };
    page(ctx, { title: ctx.t('adminH'), active: 'admin', body: M.admin(ctx, { apps, products, stats }) });
  });
  route('GET', '/admin/applications/:id', (ctx) => {
    if (!requireAdmin(ctx)) return; const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(ctx.params.id)); if (!app) throw new HttpError(404);
    page(ctx, { title: app.name, active: 'admin', body: M.adminApplication(ctx, { app, files: db.prepare(`SELECT id, label, filename FROM files WHERE owner_kind = 'application' AND owner_id = ?`).all(app.id) }) });
  });
  route('POST', '/admin/applications/:id/approve', (ctx) => {
    if (!requireAdmin(ctx)) return; const a = db.prepare(`SELECT * FROM applications WHERE id = ? AND status = 'pending'`).get(Number(ctx.params.id)); if (!a) throw new HttpError(404);
    const colors = ['#2F7D5B', '#B5542D', '#8A6A2F', '#3F5FA0', '#5B3FA0', '#A0446B', '#0F7A8A', '#556B2F'];
    tx(() => {
      let slug = slugify(a.name); let k = 2; while (db.prepare('SELECT 1 FROM suppliers WHERE slug = ?').get(slug)) slug = `${slugify(a.name)}-${k++}`;
      const sid = Number(db.prepare(`INSERT INTO suppliers (slug, name, name_ta, type, district, about, about_ta, status, since, color, contact_email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, ?, ?)`)
        .run(slug, a.name, a.name_ta, a.type, a.district, a.about, a.about_ta, new Date().getUTCFullYear(), colors[n('SELECT COUNT(*) n FROM suppliers') % colors.length], a.email, a.phone, nowIso()).lastInsertRowid);
      db.prepare('INSERT OR IGNORE INTO supplier_members (supplier_id, user_id) VALUES (?, ?)').run(sid, a.user_id);
      db.prepare(`UPDATE applications SET status = 'approved', supplier_id = ?, reviewed_at = ? WHERE id = ?`).run(sid, nowIso(), a.id);
      audit(db, ctx.user.id, 'supplier-approve', `#${a.id}`);
    });
    redirect(ctx, '/admin', { kind: 'good', msg: ctx.t('sellerApproved') });
  });
  route('POST', '/admin/applications/:id/reject', (ctx) => {
    if (!requireAdmin(ctx)) return; const reason = clean(ctx.body.reason, 500); if (!reason) throw new HttpError(400);
    if (!db.prepare(`UPDATE applications SET status = 'rejected', reason = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'`).run(reason, nowIso(), Number(ctx.params.id)).changes) throw new HttpError(404);
    audit(db, ctx.user.id, 'supplier-reject', `#${ctx.params.id}`); redirect(ctx, '/admin', { kind: 'good', msg: ctx.t('rejectedT') });
  });
  // A plain-language import check shown to the reviewer. Illustrative only: the real UK rules must be confirmed before launch.
  const ukRule = (p) => {
    if (p.category === 'Gems') return p.cert_id ? { ok: true, key: 'rule_gems_ok' } : { ok: false, key: 'rule_gems_cert' };
    if (p.category === 'Food' || p.category === 'Coconut' || p.category === 'Spices') return { ok: true, key: 'rule_food' };
    if (p.category === 'Ayurveda') return { ok: false, key: 'rule_ayurveda' };
    return { ok: true, key: 'rule_ok' };
  };
  route('GET', '/admin/products/:id', (ctx) => {
    if (!requireAdmin(ctx)) return; const p = db.prepare(`${PRODUCT_SQL} WHERE p.id = ?`).get(Number(ctx.params.id)); if (!p) throw new HttpError(404);
    page(ctx, { title: p.name, active: 'admin', body: M.adminProduct(ctx, { product: p, rule: ukRule(p) }) });
  });
  route('POST', '/admin/products/:id/approve', (ctx) => {
    if (!requireAdmin(ctx)) return;
    const p = db.prepare(`SELECT * FROM products WHERE id = ? AND status = 'review'`).get(Number(ctx.params.id)); if (!p) throw new HttpError(404);
    if (p.category === 'Gems' && !p.cert_id) return redirect(ctx, `/admin/products/${p.id}`, { kind: 'bad', msg: ctx.t('errCert') });
    db.prepare(`UPDATE products SET status = 'live', reason = NULL WHERE id = ?`).run(p.id);
    audit(db, ctx.user.id, 'product-approve', `#${p.id}`); redirect(ctx, '/admin', { kind: 'good', msg: ctx.t('productLive') });
  });
  route('POST', '/admin/products/:id/return', (ctx) => {
    if (!requireAdmin(ctx)) return; const reason = clean(ctx.body.reason, 500); if (!reason) throw new HttpError(400);
    if (!db.prepare(`UPDATE products SET status = 'returned', reason = ? WHERE id = ? AND status = 'review'`).run(reason, Number(ctx.params.id)).changes) throw new HttpError(404);
    audit(db, ctx.user.id, 'product-return', `#${ctx.params.id}`); redirect(ctx, '/admin', { kind: 'good', msg: ctx.t('returnedT') });
  });
  route('GET', '/admin/suppliers', (ctx) => {
    if (!requireAdmin(ctx)) return;
    page(ctx, { title: ctx.t('tSuppliers'), active: 'admin', body: M.adminSuppliers(ctx, { list: db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.status = 'live') products, (SELECT COALESCE(SUM(goods_pence),0) FROM shipments sh WHERE sh.supplier_id = s.id AND sh.status != 'pending') sales FROM suppliers s ORDER BY s.name`).all() }) });
  });
  for (const [act, st] of [['suspend', 'suspended'], ['reinstate', 'verified']]) {
    route('POST', `/admin/suppliers/:id/${act}`, (ctx) => { if (!requireAdmin(ctx)) return; if (!db.prepare('UPDATE suppliers SET status = ? WHERE id = ?').run(st, Number(ctx.params.id)).changes) throw new HttpError(404); audit(db, ctx.user.id, 'supplier-' + act, ctx.params.id); redirect(ctx, '/admin/suppliers', { kind: 'good', msg: ctx.t(act === 'suspend' ? 'suspendedT' : 'reinstatedT') }); });
  }
  route('GET', '/admin/orders', (ctx) => {
    if (!requireAdmin(ctx)) return;
    page(ctx, { title: ctx.t('tOrders'), active: 'admin', body: M.adminOrders(ctx, { list: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all() }) });
  });
  route('GET', '/admin/settings', (ctx) => { if (!requireAdmin(ctx)) return; page(ctx, { title: ctx.t('tSettings'), active: 'admin', body: M.adminSettings(ctx, { commission: commission() }) }); });
  route('POST', '/admin/settings', (ctx) => {
    if (!requireAdmin(ctx)) return; const pct = Number(ctx.body.commission_pct);
    if (!(pct >= 0 && pct <= 50)) return redirect(ctx, '/admin/settings', { kind: 'bad', msg: ctx.t('errCommission') });
    db.prepare(`INSERT INTO settings (key, value) VALUES ('commission_pct', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(pct));
    audit(db, ctx.user.id, 'commission', String(pct)); redirect(ctx, '/admin/settings', { kind: 'good', msg: ctx.t('saved') });
  });

  /* ---------------- request handling ---------------- */
  function serveStatic(ctx) {
    const file = path.join(PUBLIC_DIR, decodeURIComponent(ctx.url.pathname.slice('/static/'.length)));
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
    ctx.res.writeHead(200, { 'Content-Type': STATIC_TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' }); fs.createReadStream(file).pipe(ctx.res); return true;
  }
  const readBody = (req, limit) => new Promise((resolve, reject) => { const chunks = []; let size = 0; req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413)); req.destroy(); } else chunks.push(c); }); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); });

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const cookies = auth.parseCookies(req.headers.cookie);
    const lang = cookies.lang === 'ta' || cookies.lang === 'en' ? cookies.lang : (/^ta\b/i.test(req.headers['accept-language'] || '') ? 'ta' : 'en');
    const ctx = { req, res, url, query: url.searchParams, params: {}, body: {}, files: [], cookies: [], rawCookies: cookies, lang, t: makeT(lang), sid: cookies.sid, ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(), cartId: /^[a-f0-9]{48}$/.test(cookies.cart || '') ? cookies.cart : null };
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    try {
      if (url.pathname.startsWith('/static/') && req.method === 'GET') { if (serveStatic(ctx)) return; throw new HttpError(404); }
      ctx.csrf = cookies.csrf && /^[a-f0-9]{48}$/.test(cookies.csrf) ? cookies.csrf : token();
      if (ctx.csrf !== cookies.csrf) ctx.cookies.push(auth.cookie('csrf', ctx.csrf, { maxAge: 7 * 86400, secure: secure(req) }));
      if (cookies.flash) { try { ctx.flash = JSON.parse(cookies.flash); } catch { /* ignore */ } ctx.cookies.push(auth.cookie('flash', '', { maxAge: 0 })); }
      ctx.user = auth.userFromSession(db, cookies.sid);
      ctx.cartCount = ctx.cartId ? db.prepare('SELECT COALESCE(SUM(qty),0) n FROM cart_items WHERE cart_id = ?').get(ctx.cartId).n : 0;
      if (req.method === 'POST') {
        const type = req.headers['content-type'] || '';
        if (type.startsWith('multipart/form-data')) { const p = parseMultipart(await readBody(req, MAX_UPLOAD), type); ctx.body = p.fields; ctx.files = p.files; }
        else { const body = {}; for (const [k, v] of new URLSearchParams((await readBody(req, MAX_FORM)).toString('utf8'))) body[k] = body[k] === undefined ? v : [].concat(body[k], v); ctx.body = body; }
        if (!cookies.csrf || ctx.body._csrf !== cookies.csrf) throw new HttpError(403, 'csrf');
      }
      for (const r of routes) {
        if (r.method !== req.method) continue; const m = r.re.exec(url.pathname); if (!m) continue;
        r.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); });
        await r.handler(ctx); return;
      }
      throw new HttpError(404);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(new Date().toISOString(), req.method, url.pathname, err);
      if (res.headersSent) { res.end(); return; }
      const key = status === 404 ? 'notFound' : status === 403 ? (err.message === 'csrf' ? 'errCsrf' : 'forbidden') : status === 413 ? 'tooLarge' : status === 400 ? 'badRequest' : 'serverError';
      if (!ctx.csrf) ctx.csrf = token(); if (!ctx.user) ctx.user = null;
      send(ctx, status, layout(ctx, { title: ctx.t(key), body: P.message(ctx, ctx.t(key), ctx.t(key + 'P'), ['/', ctx.t('backHome')]) }));
    }
  };
}

module.exports = { createApp };
