// Fills the Supabase `products` table with CJ Dropshipping products for each storefront department.
// Safe to re-run: products are keyed by "cj-<pid>" and updated in place.
// Usage (from backend/): node --env-file=.env.local scripts/import-cj-products.mjs [perDepartment] [--only=<department>] [--dry-run]
//   Needs CJ_API_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. --dry-run lists what would
//   be imported, without saving.
//
// Same rules as NEXORA: only unbranded pieces (on CJ, designer names are counterfeits that EU customs
// seize), only names that match the department and name a premium material, and a minimum supplier price.
// Electronics (ElektroG registration) and perfume (EU cosmetics rules, hazardous shipping) are not imported.
//
// Pricing (same as SakanVIP and NEXORA): supplier price (USD -> EUR, ECB rate) x 2.5 (MARKUP_PERCENT 150),
// plus CJ's cheapest shipping to Germany within MAX_SHIPPING_DAYS and the EU import VAT CJ collects (IOSS),
// rounded to the nearest price ending in 9.99, at least MIN_PRICE. The shop has one price per product, so
// variants costing more than MAX_VARIANT_SPREAD x the cheapest are dropped and the product takes the
// highest remaining variant price; no variant is sold below its own price.
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const PER_DEPARTMENT = Number(process.argv.find(a => /^\d+$/.test(a)) || 12);
const ONLY = process.argv.find(a => a.startsWith("--only="))?.slice(7);
// Minimum supplier price (USD) per department: below these, CJ items rarely look premium.
const MIN_SUPPLIER = { sneakers: 25, "womens-clothing": 25, innerwear: 12, eveningwear: 35, "mens-suits": 40, watches: 45, "womens-bags": 30, sportswear: 15 };
const MARKUP_PERCENT = Number(process.env.MARKUP_PERCENT ?? 150);
const MIN_PRICE = Number(process.env.MIN_PRICE ?? 39.99);
const IOSS_RATE = Number(process.env.IOSS_RATE ?? 0.21);
const IOSS_FEE_USD = 0.05;
const MAX_SHIPPING_DAYS = Number(process.env.MAX_SHIPPING_DAYS ?? 20);
const MAX_VARIANT_SPREAD = 1.15;
const SHIP_TO = process.env.SHIP_TO || "DE";
const MAX_PAGES = 3;
const CJ = "https://developers.cjdropshipping.com/api2.0/v1";
const SAMPLE_IDS = ["leggings", "tote", "watch", "gift"];

// Department ids match `departments` in components/luxury-storefront.tsx. The first searches win.
const SEARCHES = [
  { department: "sneakers", keyword: "genuine leather sneakers women" },
  { department: "sneakers", keyword: "genuine leather sneakers men" },
  { department: "sneakers", keyword: "suede sneakers" },
  { department: "sneakers", keyword: "cowhide leather sneakers" },
  { department: "womens-clothing", keyword: "silk dress women" },
  { department: "womens-clothing", keyword: "satin blouse women" },
  { department: "womens-clothing", keyword: "cashmere sweater women" },
  { department: "womens-clothing", keyword: "wool coat women" },
  { department: "womens-clothing", keyword: "linen dress women" },
  { department: "innerwear", keyword: "mulberry silk underwear women" },
  { department: "innerwear", keyword: "silk bra" },
  { department: "innerwear", keyword: "modal boxer briefs men" },
  { department: "innerwear", keyword: "lace bralette" },
  { department: "innerwear", keyword: "silk camisole" },
  { department: "eveningwear", keyword: "satin evening gown" },
  { department: "eveningwear", keyword: "sequin evening gown" },
  { department: "eveningwear", keyword: "velvet evening dress" },
  { department: "eveningwear", keyword: "lace evening gown" },
  { department: "mens-suits", keyword: "wool suit men" },
  { department: "mens-suits", keyword: "tuxedo men wool" },
  { department: "mens-suits", keyword: "wool blazer men" },
  { department: "mens-suits", keyword: "linen suit men" },
  { department: "watches", keyword: "automatic mechanical watch sapphire" },
  { department: "watches", keyword: "mechanical watch stainless steel" },
  { department: "watches", keyword: "women automatic watch" },
  { department: "womens-bags", keyword: "genuine leather handbag" },
  { department: "womens-bags", keyword: "cowhide leather tote bag" },
  { department: "womens-bags", keyword: "genuine leather crossbody bag" },
  { department: "womens-bags", keyword: "leather clutch bag" },
  { department: "sportswear", keyword: "seamless yoga set women" },
  { department: "sportswear", keyword: "sports leggings women" },
  { department: "sportswear", keyword: "quick dry tracksuit men" },
  { department: "sportswear", keyword: "merino running shirt" }
];

// Designer and sportswear brand names and replica wording: never imported.
const BRANDS = /\b(gucci|louis ?vuitton|lv|chanel|dior|prada|herm[eè]s|rolex|cartier|omega|versace|armani|burberry|fendi|balenciaga|ysl|saint ?laurent|givenchy|valentino|bvlgari|bulgari|tiffany|patek|audemars|piguet|michael ?kors|coach|celine|c[eé]line|loewe|bottega|moncler|tom ?ford|calvin ?klein|hublot|tag ?heuer|breitling|longines|tissot|seiko|casio|swarovski|pandora|montblanc|mont ?blanc|ralph ?lauren|lacoste|boss|hugo|dolce|gabbana|d&g|miu ?miu|jimmy ?choo|nike|adidas|jordan|yeezy|new ?balance|converse|vans|puma|asics|reebok|fila|skechers|golden ?goose|alexander ?mcqueen|mcqueen|lululemon|under ?armou?r|gymshark|victoria'?s ?secret|hanes|replica|copy|dupe|inspired|1:1|aaa)\b/i;
// Never fits the store, in any department.
const EXCLUDED = /\b(baby|infant|toddler|kids?|child(ren)?'?s?|girls'?|boys'?|pet|puppy|dog|cat|costume|halloween|cosplay|cos|cheap|wholesale|plus size|pregnan\w*|maternity|usb|led|tool|kitchen|car|fishing|garden|digital|smart ?watch|cartoon|anime|funny|novelty|printed|print|letters?|slogan|hot sale|cute|korean|beer|pu|faux|imitation|plastic|acrylic|student|couple|neon|rainbow|fluorescent|multicolor|20\d\d|new style|disposable)\b/i;
// Extra exclusions per department; sportswear and innerwear allow the words the others reject.
const STRICT = /\b(sexy|lingerie|pajamas?|sleepwear|sports?|gym|workout|yoga|running|casual|simple|basic|trendy|trend|loose|oversized|fashion|polyester|quartz)\b/i;
const EXTRA_EXCLUDED = {
  sneakers: /\b(sexy|lingerie|pajamas?|sleepwear|yoga|loose|oversized|polyester|slippers?|sandals?|boots?)\b/i,
  innerwear: /\b(sexy|erotic|crotchless|transparent|see[- ]through|sports?|gym|workout|running|casual|trendy|oversized|fashion|polyester)\b/i,
  sportswear: /\b(sexy|lingerie|pajamas?|sleepwear|loose|oversized)\b/i
};
// Each department needs a premium material or build in the product name.
const MATERIALS = {
  sneakers: /\b(genuine leather|cowhide|calfskin|real leather|suede|nubuck)\b/i,
  "womens-clothing": /\b(silk|satin|cashmere|wool|merino|velvet|linen|lace|tweed|mulberry)\b/i,
  innerwear: /\b(silk|mulberry|modal|lace|cashmere|merino|bamboo|cotton)\b/i,
  eveningwear: /\b(satin|silk|velvet|lace|sequin(ed)?|beaded|crystal|chiffon)\b/i,
  "mens-suits": /\b(wool|cashmere|merino|tweed|linen|velvet|silk)\b/i,
  watches: /\b(automatic|mechanical|sapphire|tourbillon|stainless steel)\b/i,
  "womens-bags": /\b(genuine leather|cowhide|calfskin|real leather|suede)\b/i,
  sportswear: /\b(seamless|quick[- ]dry|breathable|compression|nylon|spandex|lycra|merino|moisture[- ]wicking)\b/i
};
const DEPARTMENT_WORDS = {
  sneakers: /sneakers?|trainers?|shoes/i,
  "womens-clothing": /dress|blouse|shirt|coat|blazer|skirt|cardigan|sweater|trench|jumpsuit/i,
  innerwear: /underwear|bra\b|bralette|briefs|boxers?|panties|knickers|camisole|undershirt|thong/i,
  eveningwear: /dress|gown/i,
  "mens-suits": /suit|blazer|tuxedo/i,
  watches: /watch/i,
  "womens-bags": /bag|handbag|tote|clutch|purse|crossbody/i,
  sportswear: /leggings|sports bra|set|tracksuit|shorts|top|shirt|jacket|hoodie|tank|jogger|pants/i
};
const fitsStore = (name, department) => !BRANDS.test(name) && !EXCLUDED.test(name) &&
  !(EXTRA_EXCLUDED[department] ?? STRICT).test(name) &&
  DEPARTMENT_WORDS[department].test(name) && MATERIALS[department].test(name);
// Variant colours that do not fit the palette are not offered.
const LOUD_COLOR = /\b(neon|fluorescent|rainbow|multi-?colou?r|colorful|hot pink|rose red|fuchsia|lime|orange|yellow|purple|light green|candy)\b/i;

// CJ titles are keyword lists ("Niche Original Genuine Genuine Leather Handbag"): drop filler words and
// repeats, and use title case, so names read like a boutique's.
const FILLER = /\b(niche|original|new|female|male|ladies'?|women'?s|men'?s|for (women|men|ladies)|high-end|high end|luxury|exquisite|fully|style|fashion|trendy|casual|handsome|commuter)\b/gi;
function cleanName(name) {
  const words = name.replace(FILLER, " ").replace(/[,;|]+/g, " ").split(/\s+/).filter(Boolean)
    .filter((w, i, all) => i === 0 || w.toLowerCase() !== all[i - 1].toLowerCase());
  const small = new Set(["and", "with", "of", "in", "for", "the", "a"]);
  return words.map((w, i) => /^\d|[A-Z]{2,}/.test(w) || (i && small.has(w.toLowerCase())) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ").slice(0, 120) || name;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const firstNumber = value => {
  const n = Number(String(value ?? "").trim().split("-")[0].trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

let token, USD_PER_EUR = Number(process.env.USD_PER_EUR) || null;
async function cj(path, init = {}) {
  await sleep(1200); // CJ allows about one request per second
  let response;
  // Short network drops should not end a long import: retry up to three times.
  for (let attempt = 1; ; attempt++) {
    try {
      response = await fetch(CJ + path, { ...init, headers: { "CJ-Access-Token": token, "Content-Type": "application/json", ...init.headers } });
      break;
    } catch (err) {
      if (attempt >= 4) throw err;
      await sleep(5000 * attempt);
    }
  }
  const body = await response.json();
  if (!response.ok || body.result === false) throw new Error(`CJ ${path}: ${body.message || response.status}`);
  return body.data;
}

const retailCents = (supplierUsd, shippingUsd) => {
  const eurCents = Math.round(supplierUsd * 100 / USD_PER_EUR);
  const costsUsd = shippingUsd + supplierUsd * IOSS_RATE + IOSS_FEE_USD;
  let cents = Math.round(eurCents * (100 + MARKUP_PERCENT) / 100) + Math.round(costsUsd * 100 / USD_PER_EUR);
  const below = Math.floor((cents + 1) / 1000) * 1000 - 1; // highest x9.99 at or below
  cents = cents - below <= below + 1000 - cents ? below : below + 1000;
  return Math.max(cents, Math.round(MIN_PRICE * 100));
};

// Cheapest real shipping (USD) to SHIP_TO for one unit of the first variant, within MAX_SHIPPING_DAYS;
// null when CJ cannot ship it there (then the product is skipped).
async function shippingUsd(detail) {
  const vid = detail?.variants?.[0]?.vid;
  if (!vid) return null;
  const quotes = await cj("/logistic/freightCalculate", {
    method: "POST", body: JSON.stringify({ startCountryCode: "CN", endCountryCode: SHIP_TO, products: [{ quantity: 1, vid }] })
  });
  const days = q => Math.max(...String(q.logisticAging || "").split("-").map(Number).filter(n => n > 0), 0) || 99;
  const prices = (quotes || []).filter(q => days(q) <= MAX_SHIPPING_DAYS)
    .map(q => Number(q.totalPostageFee) || Number(q.logisticPrice)).filter(p => p > 0);
  return prices.length ? Math.min(...prices) : null;
}

// CJ names dimensions in productKeyEn ("Color-Size") and values in variantKey ("Sky blue-M"); values can
// contain "-" ("Off-white-M"), so extra parts belong to the first dimension.
function variantOptions(dims, key) {
  const parts = String(key || "").split("-");
  if (dims.length <= 1 || parts.length < dims.length) return { [dims[0] || "Style"]: String(key || "").trim() };
  const tail = parts.splice(parts.length - (dims.length - 1));
  return Object.fromEntries(dims.map((d, i) => [d, (i === 0 ? parts.join("-") : tail[i - 1]).trim()]));
}

const images = detail => {
  let list = detail?.productImageSet ?? detail?.productImage ?? [];
  if (typeof list === "string") { try { list = JSON.parse(list); } catch { list = [list]; } }
  return [...new Set([detail?.bigImage, ...list].filter(u => /^https:\/\//.test(u || "")))].slice(0, 8);
};
const cleanDescription = html => String(html || "").replace(/<img[^>]*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);

// Builds the products row; null when no variant fits the palette and price spread.
function productRow(department, item, detail, shipping) {
  const dims = String(detail?.productKeyEn || "").split("-").map(d => d.trim()).filter(Boolean);
  const items = [];
  for (const v of detail?.variants || []) {
    const supplier = firstNumber(v.variantSellPrice);
    if (!v.vid || !supplier) continue;
    const options = variantOptions(dims, v.variantKey);
    if (Object.values(options).some(x => LOUD_COLOR.test(x))) continue;
    items.push({
      vid: String(v.vid), sku: v.variantSku || null, options,
      size: Object.entries(options).find(([k]) => /size/i.test(k))?.[1] || null,
      color: Object.entries(options).filter(([k]) => !/size/i.test(k)).map(([, x]) => x).join(" / ") || null,
      priceCents: retailCents(supplier, shipping),
      imageUrl: /^https:\/\//.test(v.variantImage || "") ? v.variantImage : null
    });
  }
  if (!items.length) return null;
  const cheapest = Math.min(...items.map(v => v.priceCents));
  const offered = items.filter(v => v.priceCents <= cheapest * MAX_VARIANT_SPREAD);
  const pics = images(detail);
  const unique = list => [...new Set(list.filter(Boolean))].slice(0, 40);
  return {
    id: `cj-${item.id}`, title: cleanName(item.name), category: department,
    description: cleanDescription(detail?.description), price: Math.max(...offered.map(v => v.priceCents)) / 100,
    currency: "EUR", image_url: pics[0] || item.image, sku: null, supplier: "CJ", inventory: 100, active: true,
    variants: { sizes: unique(offered.map(v => v.size)), colors: unique(offered.map(v => v.color)), images: pics, cjPid: item.id, shippingUsd: shipping, items: offered },
    updated_at: new Date().toISOString()
  };
}

const { CJ_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!CJ_API_KEY || (!DRY_RUN && (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY))) {
  console.error("Set CJ_API_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (ONLY && !SEARCHES.some(s => s.department === ONLY)) { console.error(`Unknown department: ${ONLY}`); process.exit(1); }
const auth = await (await fetch(CJ + "/authentication/getAccessToken", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: CJ_API_KEY })
})).json();
token = auth?.data?.accessToken;
if (!token) { console.error("CJ login failed: " + (auth?.message || "no token")); process.exit(1); }
if (!USD_PER_EUR) {
  const xml = await (await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml")).text();
  USD_PER_EUR = Number(/currency='USD' rate='([\d.]+)'/.exec(xml)?.[1]);
  if (!(USD_PER_EUR > 0)) throw new Error("Could not read the ECB USD rate; set USD_PER_EUR.");
}
console.log(`1 EUR = ${USD_PER_EUR} USD · ${PER_DEPARTMENT} per department${DRY_RUN ? " · DRY RUN" : ""}`);

const db = DRY_RUN ? null : createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const runStarted = new Date().toISOString();
const count = {};
const usedPids = new Set();
// Each search may fill only its share of the department, so a department mixes its searches.
const searchesIn = d => SEARCHES.filter(s => s.department === d).length;
for (const { department, keyword } of SEARCHES.filter(s => !ONLY || s.department === ONLY)) {
  if ((count[department] || 0) >= PER_DEPARTMENT) continue;
  const share = Math.ceil(PER_DEPARTMENT / searchesIn(department));
  const limit = Math.min(PER_DEPARTMENT, (count[department] || 0) + share);
  for (let page = 1; page <= MAX_PAGES && (count[department] || 0) < limit; page++) {
    const url = `/product/listV2?page=${page}&size=100&keyWord=${encodeURIComponent(keyword)}`;
    const list = (await cj(url))?.content?.flatMap(c => c.productList || []) || [];
    const candidates = list
      .map(p => ({ id: String(p.id || ""), name: String(p.nameEn || "").replace(/\s+/g, " ").trim(), price: firstNumber(p.sellPrice), image: p.bigImage }))
      .filter(p => p.id && !usedPids.has(p.id) && p.name && /^[\x20-\x7E]+$/.test(p.name) && p.price >= MIN_SUPPLIER[department] &&
        fitsStore(p.name, department) && /^https:\/\//.test(p.image || ""));
    for (const item of candidates) {
      if ((count[department] || 0) >= limit) break;
      usedPids.add(item.id);
      // A piece already shown in another department stays there (an upsert would move it).
      if (db) {
        const { data: existing } = await db.from("products").select("category,active").eq("id", `cj-${item.id}`).maybeSingle();
        if (existing?.active && existing.category !== department) continue;
      }
      try {
        const detail = await cj(`/product/query?pid=${item.id}`);
        const shipping = await shippingUsd(detail);
        if (shipping == null) { console.log(`  skip (no shipping to ${SHIP_TO}): ${item.name.slice(0, 60)}`); continue; }
        // Bulky items whose shipping costs more than the product itself do not fit the price range.
        if (shipping > item.price) { console.log(`  skip (shipping $${shipping} > price): ${item.name.slice(0, 60)}`); continue; }
        const row = productRow(department, item, detail, shipping);
        if (!row) { console.log(`  skip (no variant in the palette): ${item.name.slice(0, 60)}`); continue; }
        if (!DRY_RUN) {
          const { error } = await db.from("products").upsert(row, { onConflict: "id" });
          if (error) throw new Error(error.message);
        }
        console.log(`  ${department}: €${row.price.toFixed(2)} · ${row.variants.items.length} variants · ${row.title.slice(0, 60)}`);
        count[department] = (count[department] || 0) + 1;
      } catch (err) {
        console.warn(`  failed ${item.id}: ${err.message}`);
      }
    }
    if (!list.length) break;
  }
  console.log(`${department}: ${count[department] || 0} so far ("${keyword}")`);
}
if (db) {
  // A full run defines the catalogue: CJ products from earlier runs that no longer pass the rules are hidden.
  let stale = db.from("products").update({ active: false }).like("id", "cj-%").eq("active", true).lt("updated_at", runStarted);
  if (ONLY) stale = stale.eq("category", ONLY);
  const { error: staleError } = await stale;
  if (staleError) console.warn("Could not hide older products: " + staleError.message);
  // The four showcase samples from migration 001 are not real stock.
  const { error: sampleError } = await db.from("products").update({ active: false }).in("id", SAMPLE_IDS);
  if (sampleError) console.warn("Could not hide the sample products: " + sampleError.message);
}
console.log("Done:", JSON.stringify(count));
