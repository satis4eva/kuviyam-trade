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
const env = { ...process.env, PORT: String(PORT), DB_FILE: path.join(dir, 'test.db'), SEED_DEMO: '1', DEMO_MODE: '1', DEMO_PASSWORD: 'demo-pass-2026', SETUP_CODE, PAYMENT_PROVIDER: 'test' };
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
  try {
    const buyer = new Client();
    let teaId; let gemId; let orderRef;
    await step('public pages render', async () => {
      for (const u of ['/', '/products', '/suppliers', '/suppliers/nuwara-hills-tea', '/cart', '/sell', '/login', '/register']) {
        const r = await buyer.get(u); assert.equal(r.status, 200, u); assert.match(r.text, /Kuviyam Trade/);
      }
      const home = await buyer.get('/'); teaId = Number(/href="\/products\/(\d+)"/.exec((await buyer.get('/products?q=BOP+black')).text)[1]);
      assert.match(home.text, /Best sellers/); assert.match(home.text, /Jaffna curry powder/);
    });
    await step('search, filters and sorting', async () => {
      const s = await buyer.get('/products?q=cinnamon'); assert.match(s.text, /Ceylon cinnamon/); assert.doesNotMatch(s.text, /Batik sarong/);
      const c = await buyer.get('/products?category=Apparel'); assert.match(c.text, /Batik shirt/); assert.doesNotMatch(c.text, /curry powder/);
      const ta = await buyer.get('/products?q=' + encodeURIComponent('கறுவா')); assert.match(ta.text, /cinnamon/);
      const max = await buyer.get('/products?max=5'); assert.doesNotMatch(max.text, /Blue sapphire/); assert.match(max.text, /Desiccated coconut/);
      const low = await buyer.get('/products?sort=low'); assert.ok(low.text.indexOf('Desiccated coconut') < low.text.indexOf('Blue sapphire'));
      const sh = await buyer.get('/products?q=jaffna'); assert.match(sh.text, /Suppliers:/); assert.match(sh.text, /Jaffna Spice Co\./);
      const sup = await buyer.get('/suppliers?type=Cooperative'); assert.match(sup.text, /Batticaloa Coconut/); assert.doesNotMatch(sup.text, /Ratnapura Gem House/);
      assert.match((await buyer.get('/products?q=zzzz')).text, /Nothing matches/);
      const g = await buyer.get('/products?category=Gems'); gemId = Number(/href="\/products\/(\d+)"/.exec(g.text)[1]);
    });
    await step('Tamil switch', async () => {
      const r = await buyer.get('/lang/ta?back=/products'); assert.equal(r.location, '/products');
      const p = await buyer.get('/products'); assert.match(p.text, /lang="ta"/); assert.match(p.text, /தேயிலை/);
      await buyer.get('/lang/en?back=/');
    });
    await step('product page shows delivered cost and gem certificate', async () => {
      const p = await buyer.get(`/products/${teaId}?qty=2`); assert.equal(p.status, 200); assert.match(p.text, /Delivered cost/); assert.match(p.text, /UK VAT 20%/);
      const g = await buyer.get(`/products/${gemId}`); const cert = /href="\/files\/(\d+)"/.exec(g.text); assert.ok(cert, 'gem cert link');
      const f = await buyer.get(`/files/${cert[1]}`); assert.equal(f.status, 200); assert.equal(f.type, 'application/pdf');
    });
    await step('cart, checkout, test payment, order tracking page', async () => {
      assert.equal((await buyer.post('/cart/add', { product_id: teaId, qty: 2 })).location, '/cart');
      const curry = /href="\/products\/(\d+)"/.exec((await buyer.get('/products?q=curry')).text)[1];
      await buyer.post('/cart/add', { product_id: curry, qty: 1 });
      const cart = await buyer.get('/cart'); assert.match(cart.text, /Shipping \(2 parcel\(s\)\)/); assert.match(cart.text, /Checkout/);
      const bad = await buyer.post('/checkout', { name: 'Test Buyer', email: 'buyer@example.com', address1: '1 High St', city: 'London', postcode: 'NOT A CODE' }); assert.equal(bad.status, 400); assert.match(bad.text, /valid UK postcode/);
      const ok = await buyer.post('/checkout', { name: 'Test Buyer', email: 'buyer@example.com', address1: '1 High St', city: 'London', postcode: 'E1 6AN' }); assert.match(ok.location, /^\/pay\/KT-/);
      orderRef = ok.location.split('/').pop();
      assert.match((await buyer.get(ok.location)).text, /Test mode/);
      assert.equal((await buyer.post(ok.location, {})).location, `/orders/${orderRef}`);
      const o = await buyer.get(`/orders/${orderRef}`); assert.equal(o.status, 200); assert.match(o.text, /Thank you/); assert.match(o.text, /Nuwara Hills/); assert.match(o.text, /Jaffna Spice/);
      assert.match((await buyer.get('/cart')).text, /cart is empty/);
      assert.equal((await new Client().get(`/orders/${orderRef}`)).status, 404, 'strangers cannot see orders');
    });
    await step('CSRF is required on forms', async () => {
      const r = await buyer.req('POST', '/cart/add', new URLSearchParams({ product_id: teaId, qty: 1 }).toString(), { 'content-type': 'application/x-www-form-urlencoded' });
      assert.equal(r.status, 403);
    });

    const sup = new Client(); await sup.get('/login');
    await step('demo supplier: dashboard, ship a parcel with tracking', async () => {
      assert.equal((await sup.post('/login', { email: 'supplier@demo.kuviyam.org', password: 'demo-pass-2026', next: '/dashboard' })).location, '/dashboard');
      const d = await sup.get('/dashboard'); assert.equal(d.status, 200); assert.match(d.text, /Parcels to ship/); assert.match(d.text, /Low stock/);
      const orders = await sup.get('/dashboard/orders'); assert.match(orders.text, new RegExp(orderRef));
      const shipId = /\/dashboard\/shipments\/(\d+)\/packed/.exec(orders.text)[1];
      await sup.post(`/dashboard/shipments/${shipId}/packed`, {});
      assert.equal((await sup.post(`/dashboard/shipments/${shipId}/shipped`, { tracking: 'DHL 1234567890' })).location, '/dashboard/orders');
      assert.match((await sup.get('/dashboard/payouts')).text, /Due to you/);
      const o = await buyer.get(`/orders/${orderRef}`); assert.match(o.text, /DHL 1234567890/);
    });
    let newId;
    await step('supplier adds a product (goes to review), cannot touch others', async () => {
      const r = await sup.postMultipart('/dashboard/products', { name: 'Dimbula BOPF tea, 250 g', category: 'Tea', hs_code: '0902.40', unit: 'pack', price: '6.20', weight_g: '290', stock: '50', lead_days: '5', description: 'Dimbula western-slope tea.' }, { photo: ['tea.png', PNG, 'image/png'] });
      assert.equal(r.location, '/dashboard/products');
      const list = await sup.get('/dashboard/products'); assert.match(list.text, /Dimbula BOPF/); assert.match(list.text, /In review/);
      newId = Number(/href="\/dashboard\/products\/(\d+)">Edit/.exec(list.text)[1]);
      assert.equal((await buyer.get(`/products/${newId}`)).status, 404, 'not public until approved');
      const gem = await sup.postMultipart('/dashboard/products', { name: 'Ruby', category: 'Gems', hs_code: '7103.91', price: '100', weight_g: '50', stock: '1', description: 'x' });
      assert.equal(gem.status, 400); assert.match(gem.text, /Gems need a certificate/);
      assert.equal((await sup.get(`/dashboard/products/${gemId}`)).status, 404);
    });
    await step('admin setup, approve product, edit rules', async () => {
      const admin = new Client(); await admin.get('/setup');
      assert.equal((await admin.post('/setup', { code: SETUP_CODE, name: 'Admin', email: 'admin@example.com', password: 'admin-password-123' })).location, '/admin');
      assert.equal((await new Client().get('/setup')).status, 404);
      const q = await admin.get('/admin'); assert.match(q.text, /Dimbula BOPF/); assert.match(q.text, /Kithul treacle/); assert.match(q.text, /Mannar Dry Fish/);
      const pr = await admin.get(`/admin/products/${newId}`); assert.match(pr.text, /UK import check/);
      await admin.post(`/admin/products/${newId}/approve`, {});
      assert.equal((await buyer.get(`/products/${newId}`)).status, 200);
      // a price change stays live; a name change goes back to review
      const form = (over) => ({ name: 'Dimbula BOPF tea, 250 g', category: 'Tea', hs_code: '0902.40', unit: 'pack', price: '6.20', weight_g: '290', stock: '50', lead_days: '5', description: 'Dimbula western-slope tea.', ...over });
      await sup.postMultipart(`/dashboard/products/${newId}`, form({ price: '5.90' }));
      assert.match((await buyer.get(`/products/${newId}`)).text, /£5\.90/);
      await sup.postMultipart(`/dashboard/products/${newId}`, form({ price: '5.90', name: 'Dimbula BOPF tea, 300 g' }));
      assert.equal((await buyer.get(`/products/${newId}`)).status, 404);
      // approve the supplier application
      const appId = /\/admin\/applications\/(\d+)/.exec(q.text)[1];
      assert.match((await admin.get(`/admin/applications/${appId}`)).text, /business-registration\.pdf/);
      await admin.post(`/admin/applications/${appId}/approve`, {});
      assert.match((await buyer.get('/suppliers')).text, /Mannar Dry Fish/);
      // suspend hides products
      const sl = await admin.get('/admin/suppliers'); assert.match(sl.text, /Ratnapura Gem House/);
      const ratId = /Ratnapura Gem House[\s\S]*?\/admin\/suppliers\/(\d+)\/suspend/.exec(sl.text)[1];
      await admin.post(`/admin/suppliers/${ratId}/suspend`, {});
      assert.equal((await buyer.get(`/products/${gemId}`)).status, 404);
      assert.match((await admin.get('/admin/orders')).text, new RegExp(orderRef));
      await admin.post('/admin/settings', { commission_pct: '12' });
      assert.match((await admin.get('/admin/settings')).text, /value="12"/);
      assert.equal((await sup.get('/admin')).status, 403);
    });
    await step('new seller applies with documents', async () => {
      const s = new Client(); await s.get('/register');
      await s.post('/register', { name: 'New Seller', email: 'seller@example.com', password: 'long-password-1' });
      const r = await s.postMultipart('/sell', { name: 'Galle Lace', type: 'Artisan', district: 'Galle', br_no: 'GA123', contact: 'New Seller', email: 'seller@example.com', categories: 'Crafts', about: 'Beeralu lace.', agree: '1' },
        { doc_br: ['br.pdf', PDF, 'application/pdf'], doc_id: ['id.pdf', PDF, 'application/pdf'], doc_bank: ['bank.pdf', PDF, 'application/pdf'] });
      assert.equal(r.location, '/sell'); assert.match((await s.get('/sell')).text, /Under review/);
      const fake = await s.postMultipart('/sell?new=1', { name: 'X', type: 'Artisan', district: 'Galle', br_no: '1', contact: 'X', email: 'x@example.com', categories: 'Crafts', about: 'x', agree: '1' }, { doc_br: ['a.pdf', Buffer.from('not a pdf'), 'application/pdf'] });
      assert.equal(fake.status, 400);
    });
    console.log(`\nAll ${passed} checks passed.`);
  } catch (e) {
    console.error('\nFAILED after', passed, 'checks:', e.message); console.error(log.slice(-3000)); process.exitCode = 1;
  } finally { server.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
