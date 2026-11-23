# Kuviyam Trade

A bilingual (English / தமிழ்) marketplace where verified Sri Lankan suppliers sell to buyers in the UK.
First release: retail (B2C), UK delivery with shipping, import duty and VAT shown up front.
Separate from the Kuviyam charity platform; it reuses the same small engine.

## What it does

- **Buyers:** browse and search products (English or Tamil words), filter by category, supplier, price and stock, see the delivered cost on every product, use a cart that splits into one parcel per supplier, check out to a UK address, pay (test mode), then track each parcel.
- **Suppliers:** apply with business registration, ID and bank documents. Once approved they add products (photo, HS code, weight, stock; gems need a certificate), pack and ship parcels with tracking, and see payouts after commission.
- **Admin:** review supplier applications and new or changed products, with a plain UK import check. Admins can also suspend suppliers, see all orders and set the commission.

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
| `DEMO_PASSWORD` | Password for `supplier@demo.kuviyam.org` |
| `RATE_LKR_PER_GBP` | Example exchange rate for payout display |

## Before going live

- Replace the illustrative shipping and duty rates in `src/pricing.js` with the courier contract and current UK tariff rates.
- Connect DPayments, plus email for receipts and shipping notices.
- Agree the seller terms, the returns policy, and payout timing in rupees.
