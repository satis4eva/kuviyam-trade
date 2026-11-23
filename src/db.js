'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { nowIso } = require('./util');

/* One SQLite file outside the app folder (DATA_DIR, default ~/kuviyam-trade-data), so deploys never wipe it. */
function open(file) {
  const dataDir = process.env.DATA_DIR || path.join(os.homedir(), 'kuviyam-trade-data');
  const dbFile = file || process.env.DB_FILE || path.join(dataDir, 'trade.db');
  if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  for (const s of SCHEMA) db.exec(s);
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('commission_pct', '10')`).run();
  return db;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'buyer', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS suppliers (
     id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, name_ta TEXT, type TEXT NOT NULL, district TEXT NOT NULL,
     about TEXT, about_ta TEXT, status TEXT NOT NULL DEFAULT 'verified', since INTEGER, color TEXT, contact_email TEXT, phone TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS supplier_members (supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (supplier_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS applications (
     id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, name_ta TEXT, type TEXT NOT NULL, district TEXT NOT NULL, br_no TEXT NOT NULL,
     contact TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, categories TEXT NOT NULL, about TEXT NOT NULL, about_ta TEXT,
     status TEXT NOT NULL DEFAULT 'pending', reason TEXT, supplier_id INTEGER, created_at TEXT NOT NULL, reviewed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, owner_kind TEXT NOT NULL, owner_id INTEGER NOT NULL, label TEXT NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS products (
     id INTEGER PRIMARY KEY, supplier_id INTEGER NOT NULL REFERENCES suppliers(id), name TEXT NOT NULL, name_ta TEXT, category TEXT NOT NULL,
     description TEXT NOT NULL, description_ta TEXT, price_pence INTEGER NOT NULL, weight_g INTEGER NOT NULL, hs_code TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'item',
     stock INTEGER NOT NULL DEFAULT 0, lead_days INTEGER NOT NULL DEFAULT 7, status TEXT NOT NULL DEFAULT 'review', reason TEXT,
     photo_id INTEGER, cert_id INTEGER, sold INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS cart_items (cart_id TEXT NOT NULL, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, qty INTEGER NOT NULL, PRIMARY KEY (cart_id, product_id))`,
  `CREATE TABLE IF NOT EXISTS orders (
     id INTEGER PRIMARY KEY, ref TEXT NOT NULL UNIQUE, user_id INTEGER, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
     address1 TEXT NOT NULL, address2 TEXT, city TEXT NOT NULL, postcode TEXT NOT NULL, country TEXT NOT NULL DEFAULT 'UK',
     goods_pence INTEGER NOT NULL, shipping_pence INTEGER NOT NULL, duty_pence INTEGER NOT NULL, vat_pence INTEGER NOT NULL, total_pence INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending', provider TEXT NOT NULL, provider_ref TEXT, created_at TEXT NOT NULL, paid_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS order_items (
     id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, supplier_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
     name TEXT NOT NULL, price_pence INTEGER NOT NULL, qty INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS shipments (
     id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, supplier_id INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'paid', tracking TEXT, shipping_pence INTEGER NOT NULL DEFAULT 0, goods_pence INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_products_status ON products(status, category)`,
  `CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ship_supplier ON shipments(supplier_id, status)`
];

const audit = (db, userId, action, detail) =>
  db.prepare('INSERT INTO audit (user_id, action, detail, created_at) VALUES (?, ?, ?, ?)').run(userId ?? null, action, detail ? String(detail).slice(0, 500) : null, nowIso());
const setting = (db, key) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) || {}).value;

module.exports = { open, audit, setting };
