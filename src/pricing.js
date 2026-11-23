'use strict';
/*
 * Who pays what, worldwide.
 * Prices are delivered-at-place (DAP): the supplier's price covers goods, packing and shipping from Sri Lanka.
 * Import duty and local taxes are paid by the buyer on delivery, to the courier or customs.
 *
 * One exception: for UK orders of £135 or less, a UK online marketplace must charge UK VAT at the point of sale
 * (HMRC rule for low-value imports). That is switched on with the admin setting "uk_small_vat".
 * Check with the company's accountant before launch.
 */
const ZONES = ['UK', 'Europe', 'North America', 'Australia & NZ', 'Middle East', 'Asia', 'Rest of world'];
const COUNTRIES = {
  'United Kingdom': 'UK',
  'France': 'Europe', 'Germany': 'Europe', 'Switzerland': 'Europe', 'Norway': 'Europe', 'Denmark': 'Europe', 'Netherlands': 'Europe', 'Italy': 'Europe', 'Sweden': 'Europe', 'Ireland': 'Europe', 'Belgium': 'Europe',
  'Canada': 'North America', 'United States': 'North America',
  'Australia': 'Australia & NZ', 'New Zealand': 'Australia & NZ',
  'United Arab Emirates': 'Middle East', 'Qatar': 'Middle East', 'Saudi Arabia': 'Middle East', 'Kuwait': 'Middle East', 'Oman': 'Middle East',
  'India': 'Asia', 'Singapore': 'Asia', 'Malaysia': 'Asia', 'Japan': 'Asia', 'Hong Kong': 'Asia',
  'South Africa': 'Rest of world', 'Mauritius': 'Rest of world', 'Other country': 'Rest of world'
};
const COUNTRY_LIST = Object.keys(COUNTRIES);
const zoneOf = (country) => COUNTRIES[country] || 'Rest of world';

// Short duty notes shown to buyers. Plain guidance, not a calculation.
const DUTY_NOTE = {
  'UK': 'dutyUK', 'Europe': 'dutyOther', 'North America': 'dutyOther', 'Australia & NZ': 'dutyAU', 'Middle East': 'dutyOther', 'Asia': 'dutyOther', 'Rest of world': 'dutyOther'
};
const EU_COUNTRIES = ['France', 'Germany', 'Netherlands', 'Italy', 'Sweden', 'Ireland', 'Belgium', 'Denmark'];
const dutyNoteKey = (country, shipsFrom = 'Sri Lanka') => (shipsFrom === country ? 'dutyNone' : country === 'United States' ? 'dutyUS' : EU_COUNTRIES.includes(country) ? 'dutyEU' : (DUTY_NOTE[zoneOf(country)] || 'dutyOther'));

const UK_SMALL_LIMIT = 13500; // £135 in pence
/* Tax collected at checkout. Returns pence. Everything else is paid by the buyer on delivery. */
/* goods and shipping are one parcel's amounts. A UK-based seller shipping inside the UK already includes its own VAT in its prices. */
function checkoutVat(country, goods, shipping, ukSmallVat, shipsFrom = 'Sri Lanka') {
  if (ukSmallVat && country === 'United Kingdom' && shipsFrom !== 'United Kingdom' && goods <= UK_SMALL_LIMIT) return Math.round((goods + shipping) * 0.2);
  return 0;
}
const SHIPS_FROM = ['Sri Lanka', 'United Kingdom'];

module.exports = { ZONES, COUNTRIES, COUNTRY_LIST, zoneOf, dutyNoteKey, checkoutVat, UK_SMALL_LIMIT, SHIPS_FROM };
