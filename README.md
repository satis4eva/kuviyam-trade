# Trade Hub

A bilingual (English / தமிழ்) marketplace where verified Sri Lankan suppliers sell to buyers in the UK.
First release: retail (B2C), UK delivery with shipping, import duty and VAT shown up front.
Separate from the CharityHub platform; it reuses the same small engine.

## What it does

Global and quote-first. Buyers anywhere ask verified suppliers for a quote, talk on the site or on WhatsApp, then pay here. Import duty and local tax are paid by the buyer on delivery.

- **Two ways to sell a product:**
  - **Quote on request:** the product shows a guide price at the minimum order quantity (MOQ). The buyer sends a request; the supplier replies with a delivered price (goods + shipping + handling) for the buyer's country, valid for a set number of days. The buyer accepts and pays.
  - **Fixed price, buy now:** the product's price plus the supplier's delivery charge per parcel for the buyer's region (set in Shop settings). UK shops selling Sri Lankan goods use this with UK delivery.
- **Ships from Sri Lanka or the UK.** When a parcel ships within the buyer's own country, no import duty applies and no duty notice is shown.
- **Tax:** the buyer pays duty and tax on delivery, with a plain note for their country. One exception, switchable in admin: UK VAT is charged at checkout on parcels of £135 or less shipped into the UK from abroad, because UK law makes the marketplace collect it.
- **Messages:** one thread per request. Phone numbers, emails and chat links are hidden automatically, so deals and payment stay on the site.
- **WhatsApp:** suppliers and buyers can add a number. New requests, messages, quotes, payments and shipping updates go to WhatsApp, and replies come back into the thread. Until the Meta business number is connected, messages are only logged (Admin → WhatsApp).
- **Suppliers:** they apply with documents and ship from Sri Lanka or the UK. Then they manage products (quote or fixed, MOQ, guide price, stock), delivery charges and WhatsApp, answer quotes, ship with tracking, and see payouts after commission.
- **Admin:** review queue, suppliers, quote requests, orders, WhatsApp log, commission, and the UK small-parcel VAT switch.

## Run it

Requires Node.js 22.5 or later. There are no npm dependencies; it uses the built-in `node:sqlite`.

```
npm start      # http://localhost:3000
npm test       # end-to-end smoke test on a temporary database
```

## Settings (environment variables)

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 3000) |
| `DATA_DIR` | Folder for the SQLite database, kept outside the app folder so deploys don't wipe it (default `~/kuviyam-trade-data`) |
| `SETUP_CODE` | One-time code for `/setup`, which creates the first admin |
| `PAYMENT_PROVIDER` | `test` for now. DPayments plugs in once the merchant account is ready. |
| `SEED_DEMO=1` | Loads sample suppliers, products and orders on an empty database |
| `DEMO_MODE=1` | Shows the staging banner and demo login, and blocks search engines |
| `DEMO_PASSWORD` | Password for `supplier@demo.dbsgroup.io` |
| `RATE_LKR_PER_GBP` | Example exchange rate for payout display |
| `SITE_URL` | Public address used in WhatsApp links, e.g. `https://trade.dbsgroup.io` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | Meta WhatsApp Business Platform (Cloud API) access token and phone number ID |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Webhook verification token and app secret. Webhook URL: `/webhooks/whatsapp` |
| `WHATSAPP_TEMPLATE` | Approved template name for notifications sent more than 24 hours after the person's last message |

## Before going live

- Connect DPayments, and email for receipts.
- Set up the WhatsApp business number with Meta: verification, a notification template, and the webhook at `/webhooks/whatsapp`.
- Confirm the UK £135 VAT rule and VAT registration with an accountant. Agree the seller terms, the returns policy and payout timing.
- Quotes and prices are in pounds (GBP) for now. Add other currencies if buyers need them.
