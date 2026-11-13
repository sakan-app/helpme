// Fills the Supabase `products` table with CJ Dropshipping products for each storefront category.
// Safe to re-run: products are keyed by "cj-<pid>" and updated in place.
// Usage (from backend/): node --env-file=.env.local scripts/import-cj-products.mjs [perCategory] [--only=<category>] [--dry-run]
//   Needs CJ_API_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. --dry-run lists what would
//   be imported, without saving. The storefront shows up to 50 products per category.
//
// Same rules as NEXORA: only unbranded pieces (on CJ, designer names are counterfeits that EU customs
// seize), only names that match the product type and name a premium material, and a minimum supplier price.
// Beauty and perfume (EU cosmetics regulation, hazardous shipping) and electronics (ElektroG) are not imported.
//
// Pricing (same as SakanVIP and NEXORA): supplier price (USD -> EUR, ECB rate) x 2.5 (MARKUP_PERCENT 150),
// plus CJ's cheapest shipping to Germany within MAX_SHIPPING_DAYS and the EU import VAT CJ collects (IOSS),
// rounded to the nearest price ending in 9.99, at least MIN_PRICE. The shop has one price per product, so
// variants costing more than MAX_VARIANT_SPREAD x the cheapest are dropped and the product takes the
// highest remaining variant price; no variant is sold below its own price.
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const PER_CATEGORY = Number(process.argv.find(a => /^\d+$/.test(a)) || 50);
const ONLY = process.argv.find(a => a.startsWith("--only="))?.slice(7);
// Minimum supplier price (USD) per product type: below these, CJ items rarely look premium.
const MIN_SUPPLIER = { sneakers: 25, womenswear: 25, menswear: 25, innerwear: 12, eveningwear: 35, suits: 40, watches: 45, bags: 30, sportswear: 15, jewelry: 18, gifts: 20 };
const MARKUP_PERCENT = Number(process.env.MARKUP_PERCENT ?? 150);
const MIN_PRICE = Number(process.env.MIN_PRICE ?? 39.99);
const IOSS_RATE = Number(process.env.IOSS_RATE ?? 0.21);
const IOSS_FEE_USD = 0.05;
const MAX_SHIPPING_DAYS = Number(process.env.MAX_SHIPPING_DAYS ?? 20);
const MAX_VARIANT_SPREAD = 1.15;
const SHIP_TO = process.env.SHIP_TO || "DE";
const MAX_PAGES = 5;
const CJ = "https://developers.cjdropshipping.com/api2.0/v1";
const SAMPLE_IDS = ["leggings", "tote", "watch", "gift"];
// Categories used before the "Luxury Beyond Limits" storefront; moved to its category ids on every run.
const LEGACY_CATEGORIES = { sneakers: "fashion", "womens-clothing": "fashion", innerwear: "fashion", eveningwear: "fashion", "mens-suits": "fashion", "womens-bags": "bags" };

// `category` is the storefront category id (`categories` in components/luxury-storefront.tsx); `type` picks
// the filter rules below. Within a category each search fills only its share, so categories mix their searches.
const SEARCHES = [
  ...[
    ["womenswear", "silk dress women"], ["womenswear", "satin blouse women"], ["womenswear", "cashmere sweater women"],
    ["womenswear", "wool coat women"], ["womenswear", "linen dress women"], ["womenswear", "silk skirt women"],
    ["womenswear", "cashmere cardigan women"], ["eveningwear", "satin evening gown"], ["eveningwear", "sequin evening gown"],
    ["eveningwear", "velvet evening dress"], ["eveningwear", "lace evening gown"], ["eveningwear", "chiffon evening dress"],
    ["suits", "wool suit men"], ["suits", "wool blazer men"], ["suits", "linen suit men"], ["menswear", "cashmere sweater men"],
    ["menswear", "wool coat men"], ["menswear", "silk shirt men"], ["menswear", "linen shirt men"],
    ["sneakers", "genuine leather sneakers women"], ["sneakers", "genuine leather sneakers men"], ["sneakers", "suede sneakers"],
    ["innerwear", "mulberry silk underwear women"], ["innerwear", "silk camisole"], ["innerwear", "modal boxer briefs men"]
  ].map(([type, keyword]) => ({ category: "fashion", type, keyword })),
  ...["genuine leather handbag", "cowhide leather tote bag", "genuine leather crossbody bag", "leather clutch bag",
    "genuine leather shoulder bag", "cowhide bucket bag", "genuine leather backpack women", "genuine leather briefcase men"]
    .map(keyword => ({ category: "bags", type: "bags", keyword })),
  ...["automatic mechanical watch sapphire", "mechanical watch stainless steel", "women automatic watch", "skeleton automatic watch",
    "automatic chronograph watch", "automatic dress watch", "automatic diver watch sapphire"]
    .map(keyword => ({ category: "watches", type: "watches", keyword })),
  ...["925 sterling silver bracelet", "925 sterling silver earrings", "freshwater pearl earrings", "moissanite necklace",
    "18k gold plated ring", "925 sterling silver ring", "pearl bracelet", "moissanite earrings"]
    .map(keyword => ({ category: "jewelry", type: "jewelry", keyword })),
  ...["925 sterling silver necklace", "pearl necklace", "moissanite ring", "18k gold plated earrings", "silk scarf",
    "cashmere scarf", "genuine leather wallet", "genuine leather belt", "925 silver cufflinks"]
    .map(keyword => ({ category: "gifts", type: "gifts", keyword })),
  ...["seamless yoga set women", "sports leggings women", "quick dry tracksuit men", "merino running shirt",
    "seamless sports bra", "yoga jacket women", "compression shorts men", "breathable running jacket"]
    .map(keyword => ({ category: "sportswear", type: "sportswear", keyword }))
];

// Designer and sportswear brand names and replica wording: never imported.
const BRANDS = /\b(gucci|louis ?vuitton|lv|chanel|dior|prada|herm[eè]s|rolex|cartier|omega|versace|armani|burberry|fendi|balenciaga|ysl|saint ?laurent|givenchy|valentino|bvlgari|bulgari|tiffany|patek|audemars|piguet|michael ?kors|coach|celine|c[eé]line|loewe|bottega|moncler|tom ?ford|calvin ?klein|hublot|tag ?heuer|breitling|longines|tissot|seiko|casio|swarovski|pandora|montblanc|mont ?blanc|ralph ?lauren|lacoste|boss|hugo|dolce|gabbana|d&g|miu ?miu|jimmy ?choo|nike|adidas|jordan|yeezy|new ?balance|converse|vans|puma|asics|reebok|fila|skechers|golden ?goose|alexander ?mcqueen|mcqueen|lululemon|under ?armou?r|gymshark|victoria'?s ?secret|hanes|replica|copy|dupe|inspired|1:1|aaa)\b/i;
// Never fits the store, for any product type.
const EXCLUDED = /\b(baby|infant|toddler|kids?|child(ren)?'?s?|girls'?|boys'?|pet|puppy|dog|cat|costume|halloween|cosplay|cos|cheap|wholesale|plus size|pregnan\w*|maternity|usb|led|tool|kitchen|car|fishing|garden|digital|smart ?watch|cartoon|anime|funny|novelty|printed|print|letters?|slogan|hot sale|cute|korean|beer|pu|faux|imitation|plastic|acrylic|student|couple|neon|rainbow|fluorescent|multicolor|20\d\d|new style|disposable)\b/i;
// Extra exclusions per type; sportswear, sneakers and innerwear allow some words the others reject.
const STRICT = /\b(sexy|lingerie|pajamas?|sleepwear|sports?|gym|workout|yoga|running|casual|simple|basic|trendy|trend|loose|oversized|fashion|polyester|quartz)\b/i;
const EXTRA_EXCLUDED = {
  sneakers: /\b(sexy|lingerie|pajamas?|sleepwear|yoga|loose|oversized|polyester|slippers?|sandals?|boots?)\b/i,
  innerwear: /\b(sexy|erotic|crotchless|transparent|see[- ]through|sports?|gym|workout|running|casual|trendy|oversized|fashion|polyester)\b/i,
  sportswear: /\b(sexy|lingerie|pajamas?|sleepwear|loose|oversized)\b/i
};
// Each type needs a premium material or build in the product name.
const MATERIALS = {
  sneakers: /\b(genuine leather|cowhide|calfskin|real leather|suede|nubuck)\b/i,
  womenswear: /\b(silk|satin|cashmere|wool|merino|velvet|linen|lace|tweed|mulberry)\b/i,
  menswear: /\b(silk|cashmere|wool|merino|velvet|linen|tweed|mulberry)\b/i,
  innerwear: /\b(silk|mulberry|modal|lace|cashmere|merino|bamboo|cotton)\b/i,
  eveningwear: /\b(satin|silk|velvet|lace|sequin(ed)?|beaded|crystal|chiffon)\b/i,
  suits: /\b(wool|cashmere|merino|tweed|linen|velvet|silk)\b/i,
  watches: /\b(automatic|mechanical|sapphire|tourbillon|stainless steel)\b/i,
  bags: /\b(genuine leather|cowhide|calfskin|real leather|suede)\b/i,
  sportswear: /\b(seamless|quick[- ]dry|breathable|compression|nylon|spandex|lycra|merino|moisture[- ]wicking)\b/i,
  jewelry: /\b(925|sterling|18k|14k|gold|pearl|moissanite)\b/i,
  gifts: /\b(925|sterling|18k|14k|gold|pearl|moissanite|zircon|cubic zirconia|silk|cashmere|genuine leather|cowhide|calfskin|real leather)\b/i
};
const TYPE_WORDS = {
  sneakers: /sneakers?|trainers?|shoes/i,
  womenswear: /dress|blouse|shirt|coat|blazer|skirt|cardigan|sweater|trench|jumpsuit/i,
  menswear: /sweater|coat|shirt|jacket|cardigan|trousers|pants|overcoat/i,
  innerwear: /underwear|bra\b|bralette|briefs|boxers?|panties|knickers|camisole|undershirt|thong/i,
  eveningwear: /dress|gown/i,
  suits: /suit|blazer|tuxedo/i,
  watches: /watch/i,
  bags: /bag|handbag|tote|clutch|purse|crossbody|backpack|briefcase/i,
  sportswear: /leggings|sports bra|set|tracksuit|shorts|top|shirt|jacket|hoodie|tank|jogger|pants/i,
  jewelry: /necklace|bracelet|bangle|earrings?|\bring\b|pendant|brooch|anklet/i,
  gifts: /necklace|bracelet|earrings?|ring|pendant|brooch|cufflinks?|scarf|shawl|wallet|belt|card holder/i
};
const fitsStore = (name, type) => !BRANDS.test(name) && !EXCLUDED.test(name) &&
  !(EXTRA_EXCLUDED[type] ?? STRICT).test(name) && TYPE_WORDS[type].test(name) && MATERIALS[type].test(name);

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
function productRow(category, type, item, detail, shipping) {
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
    id: `cj-${item.id}`, title: cleanName(item.name), category,
    description: cleanDescription(detail?.description), price: Math.max(...offered.map(v => v.priceCents)) / 100,
    currency: "EUR", image_url: pics[0] || item.image, sku: null, supplier: "CJ", inventory: 100, active: true,
    variants: { sizes: unique(offered.map(v => v.size)), colors: unique(offered.map(v => v.color)), images: pics, cjPid: item.id, type, shippingUsd: shipping, items: offered },
    updated_at: new Date().toISOString()
  };
}

const { CJ_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!CJ_API_KEY || (!DRY_RUN && (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY))) {
  console.error("Set CJ_API_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (ONLY && !SEARCHES.some(s => s.category === ONLY)) { console.error(`Unknown category: ${ONLY}`); process.exit(1); }
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
console.log(`1 EUR = ${USD_PER_EUR} USD · ${PER_CATEGORY} per category${DRY_RUN ? " · DRY RUN" : ""}`);

const db = DRY_RUN ? null : createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const runStarted = new Date().toISOString();
const count = {};
const usedPids = new Set();
if (db) {
  // Products imported for the earlier storefront move to its category ids.
  for (const [from, to] of Object.entries(LEGACY_CATEGORIES)) {
    const { error } = await db.from("products").update({ category: to }).eq("category", from);
    if (error) throw new Error("Could not move legacy categories: " + error.message);
  }
}
const searchesIn = c => SEARCHES.filter(s => s.category === c).length;
// First pass: each search fills only its share. Second pass: any search tops the category up to its target.
for (const pass of [1, 2])
for (const { category, type, keyword } of SEARCHES.filter(s => !ONLY || s.category === ONLY)) {
  if ((count[category] || 0) >= PER_CATEGORY) continue;
  const share = Math.ceil(PER_CATEGORY / searchesIn(category));
  const limit = pass === 1 ? Math.min(PER_CATEGORY, (count[category] || 0) + share) : PER_CATEGORY;
  for (let page = 1; page <= MAX_PAGES && (count[category] || 0) < limit; page++) {
    const url = `/product/listV2?page=${page}&size=100&keyWord=${encodeURIComponent(keyword)}`;
    const list = (await cj(url))?.content?.flatMap(c => c.productList || []) || [];
    const candidates = list
      .map(p => ({ id: String(p.id || ""), name: String(p.nameEn || "").replace(/\s+/g, " ").trim(), price: firstNumber(p.sellPrice), image: p.bigImage }))
      .filter(p => p.id && !usedPids.has(p.id) && p.name && /^[\x20-\x7E]+$/.test(p.name) && p.price >= MIN_SUPPLIER[type] &&
        fitsStore(p.name, type) && /^https:\/\//.test(p.image || ""));
    for (const item of candidates) {
      if ((count[category] || 0) >= limit) break;
      usedPids.add(item.id);
      // A piece already shown in another category stays there (an upsert would move it).
      if (db) {
        const { data: existing } = await db.from("products").select("category,active").eq("id", `cj-${item.id}`).maybeSingle();
        if (existing?.active && existing.category !== category) continue;
      }
      try {
        const detail = await cj(`/product/query?pid=${item.id}`);
        const shipping = await shippingUsd(detail);
        if (shipping == null) { console.log(`  skip (no shipping to ${SHIP_TO}): ${item.name.slice(0, 60)}`); continue; }
        // Bulky items whose shipping costs more than the product itself do not fit the price range.
        if (shipping > item.price) { console.log(`  skip (shipping $${shipping} > price): ${item.name.slice(0, 60)}`); continue; }
        const row = productRow(category, type, item, detail, shipping);
        if (!row) { console.log(`  skip (no variant in the palette): ${item.name.slice(0, 60)}`); continue; }
        if (!DRY_RUN) {
          const { error } = await db.from("products").upsert(row, { onConflict: "id" });
          if (error) throw new Error(error.message);
        }
        console.log(`  ${category}/${type}: €${row.price.toFixed(2)} · ${row.variants.items.length} variants · ${row.title.slice(0, 60)}`);
        count[category] = (count[category] || 0) + 1;
      } catch (err) {
        console.warn(`  failed ${item.id}: ${err.message}`);
      }
    }
    if (!list.length) break;
  }
  console.log(`${category}: ${count[category] || 0} so far ("${keyword}", pass ${pass})`);
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
