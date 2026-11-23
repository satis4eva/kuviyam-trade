'use strict';
/*
 * WhatsApp bridge (Meta WhatsApp Business Platform, Cloud API).
 * Until the business number is set up, nothing is sent: every message is recorded in wa_log with status "not configured",
 * so the flow can be tested and shown in admin.
 *
 * Settings:
 *   WHATSAPP_TOKEN         permanent access token for the Cloud API
 *   WHATSAPP_PHONE_ID      phone number ID of the business number
 *   WHATSAPP_VERIFY_TOKEN  any secret string, also entered in Meta's webhook settings
 *   WHATSAPP_APP_SECRET    app secret, used to check incoming webhook signatures
 *   WHATSAPP_TEMPLATE      approved template name for notifications (one body parameter). Meta only allows free text
 *                          within 24 hours of the person's last message; outside that, a template is required.
 */
const crypto = require('node:crypto');
const { nowIso } = require('./util');

const configured = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
const normalise = (n) => { const d = String(n || '').replace(/[^\d+]/g, '').replace(/^00/, '+'); return /^\+?\d{8,15}$/.test(d) ? d.replace(/^\+/, '') : ''; };

function log(db, direction, phone, body, status) {
  db.prepare('INSERT INTO wa_log (direction, phone, body, status, created_at) VALUES (?, ?, ?, ?, ?)').run(direction, phone, String(body).slice(0, 1500), status, nowIso());
}

async function post(payload) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', ...payload })
  });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/* Send a message. kind 'notify' uses the approved template when one is set; kind 'reply' sends free text (inside the 24-hour window). */
async function send(db, phone, text, kind = 'notify') {
  const to = normalise(phone); if (!to) return;
  if (!configured()) { log(db, 'out', to, text, 'not configured'); return; }
  try {
    const tpl = process.env.WHATSAPP_TEMPLATE;
    if (kind === 'notify' && tpl) await post({ to, type: 'template', template: { name: tpl, language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: text.slice(0, 1000) }] }] } });
    else await post({ to, type: 'text', text: { body: text.slice(0, 4000) } });
    log(db, 'out', to, text, 'sent');
  } catch (e) { log(db, 'out', to, text, 'failed: ' + e.message.slice(0, 120)); }
}
const sendLater = (db, phone, text, kind) => { setImmediate(() => { send(db, phone, text, kind).catch(() => {}); }); };

/* Webhook signature check (X-Hub-Signature-256). */
function validSignature(raw, header) {
  const secret = process.env.WHATSAPP_APP_SECRET; if (!secret) return false;
  const want = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex'));
  const got = Buffer.from(String(header || ''));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/* Pull text messages out of a webhook payload: [{ from, text }] */
function incoming(payload) {
  const out = [];
  for (const e of payload.entry || []) for (const c of e.changes || []) for (const m of (c.value && c.value.messages) || []) {
    if (m.type === 'text' && m.text) out.push({ from: normalise(m.from), text: String(m.text.body || '').trim() });
  }
  return out;
}

module.exports = { configured, normalise, send, sendLater, validSignature, incoming, log };
