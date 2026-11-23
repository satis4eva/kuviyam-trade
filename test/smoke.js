'use strict';
/* End-to-end smoke test: starts the server on a temporary database and walks every main flow. Run: npm test */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const PORT = 4600 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kuviyam-trade-test-'));
const SETUP_CODE = 'test-setup-code-123';
const env = { ...process.env, PORT: String(PORT), DB_FILE: path.join(dir, 'test.db'), SEED_DEMO: '1', DEMO_MODE: '1', DEMO_PASSWORD: 'demo-pass-2026', SETUP_CODE, PAYMENT_PROVIDER: 'test', WHATSAPP_APP_SECRET: 'wa-test-secret', WHATSAPP_VERIFY_TOKEN: 'wa-verify' };
const crypto = require('node:crypto');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

class Client {
  constructor() { this.jar = {}; }
  cookieHeader() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  store(res) { for (const c of res.headers.getSetCookie()) { const [kv, ...attrs] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i).trim(); const v = kv.slice(i + 1).trim(); if (attrs.some((a) => /max-age=0/i.test(a))) delete this.jar[k]; else this.jar[k] = v; } }
  async req(method, url, body, headers = {}) {
    const res = await fetch(BASE + url, { method, body, headers: { cookie: this.cookieHeader(), ...headers }, redirect: 'manual' });
    this.store(res);
    const text = (res.headers.get('content-type') || '').startsWith('text') ? await res.text() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, location: res.headers.get('location'), type: res.headers.get('content-type'), text };
  }
  get(url) { return this.req('GET', url); }
  csrf() { return decodeURIComponent(this.jar.csrf || ''); }
  post(url, fields) { const b = new URLSearchParams({ _csrf: this.csrf() }); for (const [k, v] of Object.entries(fields)) for (const x of [].concat(v)) b.append(k, x); return this.req('POST', url, b.toString(), { 'content-type': 'application/x-www-form-urlencoded' }); }
  postMultipart(url, fields, files = {}) {
    const fd = new FormData(); fd.append('_csrf', this.csrf());
    for (const [k, v] of Object.entries(fields)) for (const x of [].concat(v)) fd.append(k, x);
    for (const [k, [name, buf, type]] of Object.entries(files)) fd.append(k, new Blob([buf], { type }), name);
    return this.req('POST', url, fd);
  }
}

let passed = 0;
async function step(name, fn) { await fn(); passed++; console.log('  ✓', name); }

(async () => {
  const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  const idOf = async (c, q) => Number(/href="\/products\/(\d+)"/.exec((await c.get('/products?q=' + encodeURIComponent(q))).text)[1]);
  try {
    const buyer = new Client();
    let bop; let ukCurry; let green; let gem;
    await step('public pages render', async () => {
      for (const u of ['/', '/products', '/suppliers', '/suppliers/nuwara-hills-tea', '/suppliers/lanka-pantry-london', '/cart', '/sell', '/login', '/register']) {
        const r = await buyer.get(u); assert.equal(r.status, 200, u); assert.match(r.text, /Kuviyam Trade/);
      }
      assert.match((await buyer.get('/')).text, /Source from Sri Lanka/);
      bop = await idOf(buyer, 'BOP black'); ukCurry = await idOf(buyer, 'Roasted curry powder'); green = await idOf(buyer, 'Green tea, 100'); gem = await idOf(buyer, 'Blue sapphire');
    });
    await step('search and filters, incl. ships-from and buy-now', async () => {
      assert.match((await buyer.get('/products?q=cinnamon')).text, /Ceylon cinnamon/);
      assert.match((await buyer.get('/products?q=' + encodeURIComponent('கறுவா'))).text, /cinnamon/);
      const uk = await buyer.get('/products?from=United+Kingdom'); assert.match(uk.text, /Roasted curry powder/); assert.doesNotMatch(uk.text, /Batik sarong/);
      const bn = await buyer.get('/products?buynow=1'); assert.match(bn.text, /Batik sarong/); assert.doesNotMatch(bn.text, /Desiccated coconut/);
      assert.match((await buyer.get('/suppliers?from=United+Kingdom')).text, /Lanka Pantry London/);
      assert.match((await buyer.get('/products?q=zzzz')).text, /Nothing matches/);
    });
    await step('quote product shows guide price and MOQ', async () => {
      const p = await buyer.get(`/products/${green}`); assert.match(p.text, /Guide price at minimum order/); assert.match(p.text, /Min\. order 50 pack/); assert.match(p.text, /Ask for a quote/);
      const g = await buyer.get(`/products/${gem}`); const cert = /href="\/files\/(\d+)"/.exec(g.text)[1]; assert.equal((await buyer.get(`/files/${cert}`)).type, 'application/pdf');
    });
    await step('country switch changes what can be bought', async () => {
      await buyer.get('/country?c=Canada&back=/');
      const p = await buyer.get(`/products/${bop}`); assert.match(p.text, /delivery to Canada/); assert.match(p.text, /no longer has a duty-free|at your country/);
      const u = await buyer.get(`/products/${ukCurry}`); assert.match(u.text, /does not deliver to your country/);
      assert.equal((await buyer.post('/cart/add', { product_id: ukCurry, qty: 1 })).location, `/products/${ukCurry}`);
      await buyer.get('/country?c=United+Kingdom&back=/');
      assert.match((await buyer.get(`/products/${ukCurry}`)).text, /Ships within your country/);
      await buyer.get('/lang/ta?back=/'); assert.match((await buyer.get('/products')).text, /தேயிலை/); await buyer.get('/lang/en?back=/');
    });
    let orderRef;
    await step('buy now: UK buyer, two parcels, VAT only on the imported one', async () => {
      await buyer.post('/cart/add', { product_id: bop, qty: 2 }); await buyer.post('/cart/add', { product_id: ukCurry, qty: 1 });
      const cart = await buyer.get('/cart'); assert.match(cart.text, /2 parcel\(s\)/); assert.match(cart.text, /£14\.50/); assert.match(cart.text, /£3\.95/);
      // VAT = 20% of (17.00 + 14.50) = 6.30 on the Sri Lankan parcel only
      assert.match(cart.text, /UK VAT 20%[\s\S]*?£6\.30/);
      const ok = await buyer.post('/checkout', { name: 'Test Buyer', email: 'buyer@example.com', address1: '1 High St', city: 'London', postcode: 'E1 6AN' }); assert.match(ok.location, /^\/pay\/KT-/);
      orderRef = ok.location.split('/').pop();
      assert.equal((await buyer.post(ok.location, {})).location, `/orders/${orderRef}`);
      const o = await buyer.get(`/orders/${orderRef}`); assert.match(o.text, /Thank you/); assert.match(o.text, /Lanka Pantry/);
      assert.equal((await new Client().get(`/orders/${orderRef}`)).status, 404);
    });
    await step('CSRF is required', async () => {
      assert.equal((await buyer.req('POST', '/cart/add', `product_id=${bop}`, { 'content-type': 'application/x-www-form-urlencoded' })).status, 403);
    });

    const qb = new Client(); await qb.get('/register');
    await qb.post('/register', { name: 'Kumar Toronto', email: 'kumar@example.com', password: 'long-password-1' });
    const sup = new Client(); await sup.get('/login');
    await sup.post('/login', { email: 'supplier@demo.kuviyam.org', password: 'demo-pass-2026', next: '/dashboard' });
    let rq;
    await step('quote request: contact details hidden, supplier notified', async () => {
      const r = await qb.post(`/products/${green}/request`, { qty: 200, country: 'Canada', note: 'Own label please. Call me on +1 416 555 0199 or kumar@example.com', whatsapp: '+1 416 555 0100' });
      assert.match(r.location, /^\/messages\/RQ-/); rq = r.location.split('/').pop();
      const t = await qb.get(r.location); assert.match(t.text, /Quote requested: 200 pack to Canada/); assert.match(t.text, /\[contact hidden\]/); assert.doesNotMatch(t.text, /555 0199/);
      assert.equal((await new Client().get(r.location)).status, 303, 'anonymous goes to login');
      const other = new Client(); await other.get('/login'); await other.post('/login', { email: 'ukshop@demo.kuviyam.org', password: 'demo-pass-2026', next: '/' });
      assert.equal((await other.get(r.location)).status, 404, 'other users cannot read it');
    });
    await step('supplier sets WhatsApp and delivery, replies and quotes', async () => {
      const d = await sup.get('/dashboard'); assert.match(d.text, /Requests to quote/);
      await sup.post('/dashboard/settings', { whatsapp: '+94 77 123 4567', zone_0: '14.50', zone_1: '16.50', zone_2: '19.50' });
      assert.match((await sup.get('/dashboard/settings')).text, /value="\+94771234567"/);
      const inbox = await sup.get('/messages'); assert.match(inbox.text, new RegExp(rq)); assert.match(inbox.text, /RQ-DEMO0001/);
      await sup.post(`/messages/${rq}`, { body: 'Yes, label is fine for 200.' });
      const q = await sup.post(`/messages/${rq}/quote`, { qty: 200, goods: '1100', shipping: '185', handling: '25', valid_days: 7, note: 'DHL air' });
      assert.equal(q.location, `/messages/${rq}#end`);
      const t = await qb.get(`/messages/${rq}`); assert.match(t.text, /Quote for 200 pack/); assert.match(t.text, /£1,310/); assert.match(t.text, /Accept and pay/);
      assert.equal((await qb.post(`/messages/${rq}/quote`, { qty: 1, goods: '1', shipping: '1', valid_days: 7 })).status, 403, 'buyers cannot quote');
    });
    await step('buyer accepts the quote and pays; supplier sees the order', async () => {
      const t = await qb.get(`/messages/${rq}`); const acc = /href="(\/messages\/RQ-[^"]+\/accept)"/.exec(t.text)[1];
      const form = await qb.get(acc); assert.match(form.text, /Canada/); assert.match(form.text, /£1,310/); assert.doesNotMatch(form.text, /UK VAT/);
      const r = await qb.post(acc, { name: 'Kumar', email: 'kumar@example.com', address1: '10 Sheppard Ave', city: 'Toronto', postcode: 'M1B 2K3' });
      assert.match(r.location, /^\/pay\/KT-/); const oref = r.location.split('/').pop();
      await qb.post(r.location, {});
      assert.match((await qb.get(`/messages/${rq}`)).text, new RegExp(`Paid, order ${oref}`));
      const so = await sup.get('/dashboard/orders'); assert.match(so.text, new RegExp(oref)); assert.match(so.text, /Canada/);
      const shipId = new RegExp(`${oref}[\\s\\S]*?/dashboard/shipments/(\\d+)/packed`).exec(so.text)[1];
      await sup.post(`/dashboard/shipments/${shipId}/packed`, {}); await sup.post(`/dashboard/shipments/${shipId}/shipped`, { tracking: 'DHL 99887766' });
      assert.match((await qb.get(`/orders/${oref}`)).text, /DHL 99887766/);
      assert.match((await sup.get('/dashboard/payouts')).text, /Due to you/);
    });
    await step('WhatsApp webhook: signed replies land in the thread', async () => {
      const ver = await new Client().get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wa-verify&hub.challenge=42'); assert.equal(ver.text, '42');
      const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '94771234567', type: 'text', text: { body: 'RQ-DEMO0001 Label proof is ready, call 0771234567' } }] } }] }] });
      const sig = 'sha256=' + crypto.createHmac('sha256', 'wa-test-secret').update(payload).digest('hex');
      const bad = await fetch(BASE + '/webhooks/whatsapp', { method: 'POST', body: payload, headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=bad' } }); assert.equal(bad.status, 403);
      const ok = await fetch(BASE + '/webhooks/whatsapp', { method: 'POST', body: payload, headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig } }); assert.equal(ok.status, 200);
      const demoBuyer = new Client(); await demoBuyer.get('/login'); await demoBuyer.post('/login', { email: 'buyer@demo.kuviyam.org', password: 'demo-pass-2026', next: '/' });
      const t = await demoBuyer.get('/messages/RQ-DEMO0001'); assert.match(t.text, /Label proof is ready/); assert.match(t.text, /WhatsApp/); assert.doesNotMatch(t.text, /0771234567/);
    });
    await step('UK shop adds a buy-now product', async () => {
      const uk = new Client(); await uk.get('/login'); await uk.post('/login', { email: 'ukshop@demo.kuviyam.org', password: 'demo-pass-2026', next: '/dashboard' });
      const r = await uk.postMultipart('/dashboard/products', { name: 'Murukku, 400 g', category: 'Food', hs_code: '1905.90', unit: 'pack', mode: 'fixed', price: '3.49', moq: '1', weight_g: '450', stock: '40', description: 'Crunchy murukku.' }, { photo: ['m.png', PNG, 'image/png'] });
      assert.equal(r.location, '/dashboard/products'); assert.match((await uk.get('/dashboard/products')).text, /Fixed price, buy now/);
      assert.equal((await uk.postMultipart('/dashboard/products', { name: 'Ruby', category: 'Gems', hs_code: '7103.91', price: '100', weight_g: '50', stock: '1', description: 'x' })).status, 400);
    });
    await step('admin: queue, requests, WhatsApp log, settings, suspend', async () => {
      const admin = new Client(); await admin.get('/setup');
      assert.equal((await admin.post('/setup', { code: SETUP_CODE, name: 'Admin', email: 'admin@example.com', password: 'admin-password-123' })).location, '/admin');
      const q = await admin.get('/admin'); assert.match(q.text, /Murukku/); assert.match(q.text, /Mannar Dry Fish/);
      const mid = /\/admin\/products\/(\d+)"[\s\S]{0,400}?/.exec(q.text.slice(q.text.indexOf('Murukku') - 600))[1];
      await admin.post(`/admin/products/${mid}/approve`, {});
      assert.match((await admin.get('/admin/requests')).text, new RegExp(rq));
      const w = await admin.get('/admin/whatsapp'); assert.match(w.text, /not connected/); assert.match(w.text, /not configured/); assert.match(w.text, /Label proof/);
      await admin.post('/admin/settings', { commission_pct: '12' });
      const st = await admin.get('/admin/settings'); assert.match(st.text, /value="12"/); assert.doesNotMatch(st.text, /name="uk_small_vat" value="1" checked/);
      const appId = /\/admin\/applications\/(\d+)/.exec(q.text)[1]; await admin.post(`/admin/applications/${appId}/approve`, {});
      assert.match((await buyer.get('/suppliers')).text, /Mannar Dry Fish/);
      const sl = await admin.get('/admin/suppliers'); const ratId = /Ratnapura Gem House[\s\S]*?\/admin\/suppliers\/(\d+)\/suspend/.exec(sl.text)[1];
      await admin.post(`/admin/suppliers/${ratId}/suspend`, {}); assert.equal((await buyer.get(`/products/${gem}`)).status, 404);
      assert.equal((await sup.get('/admin')).status, 403);
    });
    await step('UK-based seller applies', async () => {
      const s = new Client(); await s.get('/register'); await s.post('/register', { name: 'New Seller', email: 'seller@example.com', password: 'long-password-1' });
      const r = await s.postMultipart('/sell', { ships_from: 'United Kingdom', town: 'Wembley', name: 'Wembley Spice', type: 'Small business', district: 'Colombo', br_no: '12345678', contact: 'New Seller', email: 'seller@example.com', categories: 'Spices', about: 'Spices shop.', agree: '1' },
        { doc_br: ['br.pdf', PDF, 'application/pdf'], doc_id: ['id.pdf', PDF, 'application/pdf'], doc_bank: ['bank.pdf', PDF, 'application/pdf'] });
      assert.equal(r.location, '/sell'); const st = await s.get('/sell'); assert.match(st.text, /Under review/); assert.match(st.text, /Wembley, United Kingdom/);
    });
    console.log(`\nAll ${passed} checks passed.`);
  } catch (e) {
    console.error('\nFAILED after', passed, 'checks:', e.message.slice(0, 1500)); console.error(log.slice(-3000)); process.exitCode = 1;
  } finally { server.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
