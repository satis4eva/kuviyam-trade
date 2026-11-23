'use strict';
/*
 * Delivered-cost estimate for the UK (first release ships to the UK only).
 * Rates are ILLUSTRATIVE and must be replaced with the courier contract and current tariff rates before launch.
 * Each supplier ships its own parcel, so shipping is charged per supplier.
 */
const DEST = {
  UK: { base: 600, perKg: 420, vat: 0.20, duty: { Tea: 0, Spices: 0, Coconut: 0.02, Food: 0.05, Apparel: 0.12, Gems: 0, Ayurveda: 0.04, Crafts: 0.03 } }
};

function quote(lines, country = 'UK') {
  const d = DEST[country];
  const parcels = new Map();
  let goods = 0; let duty = 0;
  for (const { product: p, qty } of lines) {
    const value = p.price_pence * qty;
    goods += value;
    duty += Math.round(value * (d.duty[p.category] ?? 0.05));
    const parcel = parcels.get(p.supplier_id) || { supplier_id: p.supplier_id, goods: 0, grams: 0 };
    parcel.goods += value; parcel.grams += p.weight_g * qty;
    parcels.set(p.supplier_id, parcel);
  }
  let shipping = 0;
  for (const parcel of parcels.values()) {
    parcel.shipping = Math.round(d.base + d.perKg * Math.ceil(parcel.grams / 100) / 10);
    shipping += parcel.shipping;
  }
  const vat = Math.round((goods + shipping + duty) * d.vat);
  return { goods, shipping, duty, vat, total: goods + shipping + duty + vat, parcels: [...parcels.values()] };
}

module.exports = { quote, DEST };
