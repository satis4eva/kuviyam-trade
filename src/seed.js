'use strict';
/* Demo data for the staging site (SEED_DEMO=1). Runs once: it does nothing if any supplier exists. */
const { nowIso, ref } = require('./util');
const { hashPassword } = require('./auth');
const { quote } = require('./pricing');

function samplePdf(title) {
  const text = `Sample document - demo data: ${title}`.replace(/[()\\]/g, '');
  const stream = `BT /F1 14 Tf 60 760 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const SUPPLIERS = [
  { slug: 'nuwara-hills-tea', name: 'Nuwara Hills Tea Estate', name_ta: 'நுவரா மலைத் தேயிலைத் தோட்டம்', type: 'Estate or farm', district: 'Nuwara Eliya', since: 1998, color: '#2F7D5B',
    about: 'High-grown Ceylon tea picked and packed on the estate. Orthodox black, green and silver tips.', about_ta: 'தோட்டத்திலேயே பறித்துப் பொதியிடப்படும் உயர்நிலத் தேயிலை. கறுப்பு, பச்சை, வெள்ளி முனைத் தேயிலைகள்.' },
  { slug: 'jaffna-spice-co', name: 'Jaffna Spice Co.', name_ta: 'யாழ் வாசனைப் பொருள் நிறுவனம்', type: 'Small business', district: 'Jaffna', since: 2012, color: '#B5542D',
    about: 'Jaffna curry powders roasted and ground in small batches, plus true Ceylon cinnamon and pepper.', about_ta: 'சிறு தொகுதிகளாக வறுத்து அரைக்கப்படும் யாழ்ப்பாணக் கறித்தூள், உண்மையான இலங்கைக் கறுவா, மிளகு.' },
  { slug: 'batticaloa-coconut', name: 'Batticaloa Coconut Cooperative', name_ta: 'மட்டக்களப்புத் தென்னைக் கூட்டுறவுச் சங்கம்', type: 'Cooperative', district: 'Batticaloa', since: 2008, color: '#8A6A2F',
    about: 'Owned by 140 coconut growers. Virgin coconut oil, desiccated coconut and coir goods.', about_ta: '140 தென்னை விவசாயிகளுக்குச் சொந்தமானது. தூய தேங்காய் எண்ணெய், உலர் தேங்காய்த் தூள், தும்புப் பொருட்கள்.' },
  { slug: 'ratnapura-gem-house', name: 'Ratnapura Gem House', name_ta: 'இரத்தினபுரி இரத்தின இல்லம்', type: 'Exporter', district: 'Ratnapura', since: 1985, color: '#5B3FA0',
    about: 'Licensed gem exporter. Every stone ships with a laboratory certificate.', about_ta: 'அனுமதிபெற்ற இரத்தின ஏற்றுமதியாளர். ஒவ்வொரு கல்லும் ஆய்வகச் சான்றிதழுடன் அனுப்பப்படும்.' },
  { slug: 'kandy-batik-studio', name: 'Kandy Batik Studio', name_ta: 'கண்டி பத்திக் கலைக்கூடம்', type: 'Artisan', district: 'Kandy', since: 2005, color: '#3F5FA0',
    about: 'Hand-drawn wax batik sarongs, shirts and wall hangings made by a family workshop.', about_ta: 'குடும்பப் பட்டறையில் கையால் வரையப்படும் மெழுகுப் பத்திக் சாரம், சட்டை, சுவர் அலங்காரங்கள்.' },
  { slug: 'trinco-palmyrah-crafts', name: 'Trinco Palmyrah Crafts', name_ta: 'திருமலை பனைக் கைவினைகள்', type: 'Cooperative', district: 'Trincomalee', since: 2015, color: '#0F7A8A',
    about: 'Palmyrah leaf baskets, boxes and mats woven by women’s groups in the East, and palmyrah jaggery.', about_ta: 'கிழக்கு மாகாணப் பெண்கள் குழுக்களால் பின்னப்படும் பனையோலைக் கூடைகள், பெட்டிகள், பாய்கள்; பனங்கட்டி.' }
];

// [supplier slug, name, name_ta, category, price £, weight g, hs, unit, stock, sold, description, description_ta]
const PRODUCTS = [
  ['nuwara-hills-tea', 'High-grown BOP black tea, 400 g', 'உயர்நிலக் கறுப்புத் தேயிலை BOP, 400 கி', 'Tea', 8.5, 450, '0902.40', 'pack', 120, 341, 'Bright, brisk breakfast tea from 1,900 m. Loose leaf in a foil-lined pack.', '1,900 மீ உயரத்திலிருந்து தெளிவான, சுறுசுறுப்பான காலைத் தேநீர். தகடு உள்ள பொதியில் இலைத் தேயிலை.'],
  ['nuwara-hills-tea', 'Silver tips white tea, 50 g', 'வெள்ளி முனை வெண் தேயிலை, 50 கி', 'Tea', 24, 120, '0902.20', 'tin', 18, 62, 'Hand-picked buds, sun-withered. Light, honeyed and rare.', 'கையால் பறித்த மொட்டுகள், வெயிலில் உலர்த்தியவை. இலேசான, தேன் சுவை.'],
  ['nuwara-hills-tea', 'Green tea, 100 g', 'பச்சைத் தேயிலை, 100 கி', 'Tea', 7, 160, '0902.10', 'pack', 64, 128, 'Ceylon green tea, pan-fired on the estate.', 'தோட்டத்திலேயே வறுக்கப்பட்ட இலங்கைப் பச்சைத் தேயிலை.'],
  ['nuwara-hills-tea', 'Tea gift box, 6 estates', 'தேயிலைப் பரிசுப் பெட்டி, 6 வகை', 'Tea', 19.5, 700, '0902.40', 'box', 3, 87, 'Six 50 g tins from different elevations. Ready to give.', 'வெவ்வேறு உயரங்களிலிருந்து ஆறு 50 கி டின்கள். பரிசளிக்கத் தயார்.'],
  ['jaffna-spice-co', 'Jaffna curry powder, 500 g', 'யாழ்ப்பாணக் கறித்தூள், 500 கி', 'Spices', 6.5, 540, '0910.91', 'pack', 200, 512, 'Dark-roasted Jaffna blend: chilli, coriander, cumin, fennel, curry leaf.', 'கருமையாக வறுத்த யாழ் கலவை: மிளகாய், கொத்தமல்லி, சீரகம், பெருஞ்சீரகம், கறிவேப்பிலை.'],
  ['jaffna-spice-co', 'True Ceylon cinnamon quills, 100 g', 'உண்மையான இலங்கைக் கறுவாப் பட்டை, 100 கி', 'Spices', 5.5, 130, '0906.11', 'pack', 150, 289, 'Alba grade quills, thin and sweet. Low coumarin.', 'அல்பா தரப் பட்டைகள், மெல்லியவை, இனிப்பானவை.'],
  ['jaffna-spice-co', 'Black pepper, whole, 250 g', 'முழு கறுப்பு மிளகு, 250 கி', 'Spices', 4.8, 280, '0904.11', 'pack', 90, 176, 'Bold Sri Lankan pepper with high piperine.', 'காரம் மிக்க இலங்கை மிளகு.'],
  ['jaffna-spice-co', 'Odiyal flour, 1 kg', 'ஒடியல் மா, 1 கிகி', 'Food', 7.5, 1050, '1106.30', 'pack', 40, 94, 'Sun-dried palmyrah tuber flour for odiyal kool and pittu.', 'ஒடியல் கூழ், பிட்டுக்கான வெயிலில் உலர்த்திய பனங்கிழங்கு மா.'],
  ['batticaloa-coconut', 'Virgin coconut oil, 1 L', 'தூய தேங்காய் எண்ணெய், 1 லீ', 'Coconut', 11, 1150, '1513.11', 'bottle', 80, 233, 'Cold-pressed from fresh kernels within hours of picking.', 'பறித்த சில மணிநேரத்தில் புதிய தேங்காயிலிருந்து குளிர் அழுத்தம்.'],
  ['batticaloa-coconut', 'Desiccated coconut, 500 g', 'உலர் தேங்காய்த் தூள், 500 கி', 'Coconut', 4.2, 530, '0801.11', 'pack', 160, 198, 'Fine grade, unsweetened. For baking and sambol.', 'நுண்ணிய தரம், இனிப்பில்லாதது.'],
  ['batticaloa-coconut', 'Coir doormat', 'தும்புக் கால்மிதி', 'Crafts', 9, 1400, '5702.20', 'item', 35, 71, 'Hard-wearing natural coir, 40 × 60 cm.', 'நீடித்து உழைக்கும் இயற்கைத் தும்பு, 40 × 60 செமீ.'],
  ['ratnapura-gem-house', 'Blue sapphire, 1.2 ct, heated', 'நீலக்கல், 1.2 கரட்', 'Gems', 640, 60, '7103.91', 'stone', 2, 4, 'Cornflower blue oval, eye clean. Lab certificate included.', 'சோளப்பூ நீல ஓவல், கண்ணுக்குத் தெளிவானது. ஆய்வகச் சான்றிதழ் உண்டு.'],
  ['ratnapura-gem-house', 'Moonstone, 3.5 ct', 'சந்திரகாந்தக் கல், 3.5 கரட்', 'Gems', 85, 50, '7103.99', 'stone', 6, 11, 'Meetiyagoda moonstone with strong blue sheen.', 'வலுவான நீல ஒளிர்வு கொண்ட மீட்டியாகொட சந்திரகாந்தம்.'],
  ['kandy-batik-studio', 'Batik sarong, cotton', 'பத்திக் சாரம், பருத்தி', 'Apparel', 22, 380, '6207.91', 'item', 25, 143, 'Hand-drawn wax batik on soft cotton. Each one is a little different.', 'மென்மையான பருத்தியில் கையால் வரைந்த மெழுகுப் பத்திக்.'],
  ['kandy-batik-studio', 'Batik shirt, short sleeve', 'பத்திக் சட்டை, அரைக்கை', 'Apparel', 28, 300, '6205.20', 'item', 30, 97, 'Relaxed fit, sizes S to XXL.', 'தளர்வான அளவு, S முதல் XXL வரை.'],
  ['kandy-batik-studio', 'Batik wall hanging, peacock', 'பத்திக் சுவர் அலங்காரம், மயில்', 'Crafts', 35, 420, '6304.93', 'item', 8, 39, 'Framed-ready, 60 × 90 cm.', '60 × 90 செமீ.'],
  ['trinco-palmyrah-crafts', 'Palmyrah leaf basket, large', 'பனையோலைக் கூடை, பெரியது', 'Crafts', 16, 600, '4602.19', 'item', 20, 118, 'Tightly woven, natural and dyed leaf. Made by the Kinniya women’s group.', 'இறுக்கமாகப் பின்னப்பட்டது. கிண்ணியா பெண்கள் குழுவால் செய்யப்பட்டது.'],
  ['trinco-palmyrah-crafts', 'Palmyrah jaggery, 500 g', 'பனங்கட்டி, 500 கி', 'Food', 5.5, 540, '1701.13', 'pack', 70, 156, 'Unrefined palmyrah sugar. Rich and smoky.', 'சுத்திகரிக்கப்படாத பனஞ்சீனி.'],
  ['trinco-palmyrah-crafts', 'Herbal balm, 30 g', 'மூலிகைத் தைலம், 30 கி', 'Ayurveda', 6, 80, '3304.99', 'jar', 50, 64, 'Traditional herbal balm with eucalyptus and camphor, for massage.', 'யூகலிப்டஸ், கற்பூரம் கொண்ட பாரம்பரிய மசாஜ் தைலம்.']
];

function seedDemo(db) {
  if (db.prepare('SELECT 1 FROM suppliers LIMIT 1').get()) return false;
  const pw = process.env.DEMO_PASSWORD || require('node:crypto').randomBytes(9).toString('base64url');
  const now = nowIso();
  const fileIns = db.prepare(`INSERT INTO files (owner_kind, owner_id, label, filename, mime, size, data, created_at) VALUES (?, ?, ?, ?, 'application/pdf', ?, ?, ?)`);
  db.exec('BEGIN');
  try {
    const sid = {};
    for (const s of SUPPLIERS) {
      sid[s.slug] = Number(db.prepare(`INSERT INTO suppliers (slug, name, name_ta, type, district, about, about_ta, status, since, color, contact_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, ?)`)
        .run(s.slug, s.name, s.name_ta, s.type, s.district, s.about, s.about_ta, s.since, s.color, `hello@${s.slug}.example`, now).lastInsertRowid);
    }
    const uid = Number(db.prepare(`INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('supplier@demo.kuviyam.org', 'Demo Supplier', ?, 'buyer', ?)`).run(hashPassword(pw), now).lastInsertRowid);
    db.prepare('INSERT INTO supplier_members (supplier_id, user_id) VALUES (?, ?)').run(sid['nuwara-hills-tea'], uid);
    const pid = [];
    for (const [slug, name, nameTa, cat, price, w, hs, unit, stock, sold, desc, descTa] of PRODUCTS) {
      const id = Number(db.prepare(`INSERT INTO products (supplier_id, name, name_ta, category, description, description_ta, price_pence, weight_g, hs_code, unit, stock, lead_days, status, sold, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, ?)`)
        .run(sid[slug], name, nameTa, cat, desc, descTa, Math.round(price * 100), w, hs, unit, stock, cat === 'Gems' ? 10 : 5, sold, now).lastInsertRowid);
      if (cat === 'Gems') { const pdf = samplePdf(`Gem certificate - ${name}`); const f = Number(fileIns.run('product', id, 'cert', 'gem-certificate.pdf', pdf.length, pdf, now).lastInsertRowid); db.prepare('UPDATE products SET cert_id = ? WHERE id = ?').run(f, id); }
      pid.push(id);
    }
    // One product waiting for review, so the admin queue has something in it.
    db.prepare(`INSERT INTO products (supplier_id, name, name_ta, category, description, price_pence, weight_g, hs_code, unit, stock, status, created_at) VALUES (?, 'Kithul treacle, 350 ml', 'கித்துள் பாணி, 350 மி.லீ', 'Food', 'Pure kithul palm treacle from Sabaragamuwa.', 690, 520, '1702.90', 'bottle', 40, 'review', ?)`).run(sid['jaffna-spice-co'], now);
    // Two paid demo orders containing tea, so the demo supplier sees parcels to pack and ship.
    const product = (id) => db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    const orders = [
      { name: 'Priya Raman', email: 'priya@example.com', address1: '12 Station Road', city: 'Harrow', postcode: 'HA1 2AA', lines: [[pid[0], 2], [pid[4], 1]] },
      { name: 'Arun Sivakumar', email: 'arun@example.com', address1: '4 Mill Lane', city: 'Croydon', postcode: 'CR0 1AB', lines: [[pid[1], 1]] }
    ];
    for (const o of orders) {
      const lines = o.lines.map(([id, qty]) => ({ product: product(id), qty })); const q = quote(lines);
      const oid = Number(db.prepare(`INSERT INTO orders (ref, name, email, address1, city, postcode, goods_pence, shipping_pence, duty_pence, vat_pence, total_pence, status, provider, provider_ref, created_at, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'test', 'demo', ?, ?)`)
        .run(ref('KT'), o.name, o.email, o.address1, o.city, o.postcode, q.goods, q.shipping, q.duty, q.vat, q.total, now, now).lastInsertRowid);
      for (const l of lines) db.prepare('INSERT INTO order_items (order_id, supplier_id, product_id, name, price_pence, qty) VALUES (?, ?, ?, ?, ?, ?)').run(oid, l.product.supplier_id, l.product.id, l.product.name, l.product.price_pence, l.qty);
      for (const p of q.parcels) db.prepare(`INSERT INTO shipments (order_id, supplier_id, status, shipping_pence, goods_pence, updated_at) VALUES (?, ?, 'paid', ?, ?, ?)`).run(oid, p.supplier_id, p.shipping, p.goods, now);
    }
    // A pending supplier application with sample documents.
    const appUser = Number(db.prepare(`INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('applicant@demo.kuviyam.org', 'Demo Applicant', ?, 'buyer', ?)`).run(hashPassword(pw), now).lastInsertRowid);
    const aid = Number(db.prepare(`INSERT INTO applications (user_id, name, name_ta, type, district, br_no, contact, email, phone, categories, about, about_ta, status, created_at) VALUES (?, 'Mannar Dry Fish Traders', 'மன்னார் கருவாட்டு வணிகர்', 'Small business', 'Mannar', 'PV 00123456', 'Demo Applicant', 'applicant@demo.kuviyam.org', '+94 77 000 0000', 'Food', 'Sun-dried fish and prawns from Mannar island, packed for export.', 'மன்னார்த் தீவிலிருந்து வெயிலில் உலர்த்திய மீன், இறால்.', 'pending', ?)`).run(appUser, now).lastInsertRowid);
    for (const [label, fname] of [['br', 'business-registration.pdf'], ['id', 'nic.pdf'], ['bank', 'bank-letter.pdf']]) { const pdf = samplePdf(fname); fileIns.run('application', aid, label, fname, pdf.length, pdf, now); }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return true;
}

module.exports = { seedDemo, samplePdf };
