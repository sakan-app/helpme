"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bluetooth, BriefcaseBusiness, Check, ChevronDown, Crown,
  Gem, Heart, Laptop, Menu, Minus, Monitor, Package, Plus, Search, ShieldCheck,
  ShoppingBag, Smartphone, Sparkles, Watch, X, Footprints, Shirt, Dumbbell,
  ShirtIcon, ShoppingBasket, CreditCard, Globe2
} from "lucide-react";

type Locale = "DE" | "EN" | "AR";
type Department = { id: string; de: string; en: string; ar: string; icon: typeof Footprints; };
type Product = { id: string; title: string; category: string; price?: number; currency?: string; sizes?: string[]; colors?: string[]; imageUrl?: string | null; description?: string; };
type Line = { id: string; product: Product; size: string; color: string; quantity: number; };
type Step = "catalog" | "product" | "summary" | "checkout";
type BuildInfo = { version: string; commit: string; deployedAt: string | null; environment: string };

const departments: Department[] = [
  { id:"sneakers", de:"Sneaker", en:"Sneakers", ar:"أحذية رياضية", icon:Footprints },
  { id:"smartphones", de:"Smartphones", en:"Smartphones", ar:"هواتف ذكية", icon:Smartphone },
  { id:"computers", de:"Computer & Laptops", en:"Computers & Laptops", ar:"كمبيوتر", icon:Laptop },
  { id:"bluetooth", de:"Bluetooth-Geräte", en:"Bluetooth Devices", ar:"بلوتوث", icon:Bluetooth },
  { id:"womens-clothing", de:"Damenmode", en:"Women's Clothing", ar:"ملابس حريمي", icon:Shirt },
  { id:"innerwear", de:"Unterwäsche", en:"Innerwear", ar:"ملابس داخلية", icon:ShirtIcon },
  { id:"eveningwear", de:"Abendmode", en:"Evening Wear", ar:"ملابس سهرة", icon:Gem },
  { id:"mens-suits", de:"Herrenanzüge", en:"Men's Suits", ar:"بدل رجالي", icon:BriefcaseBusiness },
  { id:"perfumes", de:"Luxusparfüms", en:"Luxury Perfumes", ar:"عطور فاخرة", icon:Sparkles },
  { id:"watches", de:"Uhren", en:"Watches", ar:"ساعات", icon:Watch },
  { id:"womens-bags", de:"Damentaschen", en:"Women's Bags", ar:"شنط حريمي", icon:ShoppingBasket },
  { id:"sportswear", de:"Sportbekleidung", en:"Sportswear", ar:"ملابس رياضية", icon:Dumbbell }
];

const words = {
  DE: { tagline:"DIE KUNST DES BESONDEREN", headline:"Zeitlose Eleganz. Außergewöhnliche Auswahl.", intro:"Entdecken Sie eine kuratierte Welt aus Design, Stil und moderner Lebensart.", explore:"Kollektion entdecken", all:"Alle Kategorien", search:"Kollektion durchsuchen …", size:"Größe / Modell", color:"Farbe", price:"Preis", quantity:"Menge", continue:"Weiter", add:"In den Warenkorb", back:"Zurück", summary:"Ihre Auswahl", count:"Anzahl", type:"Kategorie", confirm:"Auswahl bestätigen", checkout:"Sicher zur Kasse", cart:"Warenkorb", empty:"Ihr Warenkorb ist noch leer.", subtotal:"Zwischensumme", payment:"Zahlung", secure:"Sichere Zahlungsabwicklung", cardholder:"Karteninhaber", cardnumber:"Kartennummer", expiry:"Ablaufdatum", cvv:"Prüfnummer", pay:"Zahlung fortsetzen", demo:"Zahlungsanbieter noch nicht verbunden. Es werden keine Kartendaten verarbeitet.", placeholder:"Produktbild folgt", select:"Auswählen", items:"Artikel", language:"Sprache", inventory:"Aus dem Sortiment", unavailable:"Preis und Varianten werden nach Anbindung des Inventars angezeigt." },
  EN: { tagline:"THE ART OF DISTINCTION", headline:"Timeless elegance. An exceptional edit.", intro:"Discover a curated world of design, personal style and modern living.", explore:"Explore the collection", all:"All departments", search:"Search the collection …", size:"Size / Model", color:"Color", price:"Price", quantity:"Quantity", continue:"Continue", add:"Add to bag", back:"Back", summary:"Your selection", count:"Count", type:"Department", confirm:"Confirm selection", checkout:"Secure checkout", cart:"Shopping bag", empty:"Your bag is empty.", subtotal:"Subtotal", payment:"Payment", secure:"Secure payment experience", cardholder:"Cardholder", cardnumber:"Card number", expiry:"Expiry date", cvv:"Security code", pay:"Continue to payment", demo:"Payment provider not connected. No card details are processed.", placeholder:"Product image coming soon", select:"Select", items:"Items", language:"Language", inventory:"From our collection", unavailable:"Price and variants appear once inventory is connected." },
  AR: { tagline:"فن التميز", headline:"أناقة خالدة. مجموعة استثنائية.", intro:"اكتشف عالماً منتقى من التصميم والأناقة وأسلوب الحياة العصري.", explore:"اكتشف المجموعة", all:"جميع الأقسام", search:"ابحث في المجموعة …", size:"المقاس / الطراز", color:"اللون", price:"السعر", quantity:"الكمية", continue:"متابعة", add:"أضف إلى السلة", back:"رجوع", summary:"اختياراتك", count:"العدد", type:"القسم", confirm:"تأكيد الاختيار", checkout:"الدفع الآمن", cart:"سلة التسوق", empty:"سلتك فارغة حالياً.", subtotal:"المجموع الفرعي", payment:"الدفع", secure:"تجربة دفع آمنة", cardholder:"حامل البطاقة", cardnumber:"رقم البطاقة", expiry:"تاريخ الانتهاء", cvv:"رمز الأمان", pay:"متابعة الدفع", demo:"لم يتم ربط مزود الدفع بعد. لن تتم معالجة بيانات البطاقة.", placeholder:"صورة المنتج قريباً", select:"اختر", language:"اللغة", inventory:"من مجموعتنا", unavailable:"سيظهر السعر والخيارات بعد ربط المخزون." }
} satisfies Record<Locale, Record<string,string>>;

const money = (price?: number, currency = "EUR", locale = "de-DE") => typeof price === "number" ? new Intl.NumberFormat(locale, { style:"currency", currency }).format(price) : "—";
const localeFromBrowser = (): Locale => {
  if (typeof navigator === "undefined") return "DE";
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("ar")) return "AR";
  if (lang.startsWith("en")) return "EN";
  return "DE";
};

export default function LuxuryStorefront() {
  const [locale, setLocale] = useState<Locale>("DE");
  const [department, setDepartment] = useState("sneakers");
  const [search, setSearch] = useState("");
  const [inventory, setInventory] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [step, setStep] = useState<Step>("catalog");
  const [cart, setCart] = useState<Line[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const t = words[locale];
  const rtl = locale === "AR";

  useEffect(() => {
    fetch("/api/build-info", { cache: "no-store" })
      .then(response => response.ok ? response.json() as Promise<BuildInfo> : Promise.reject(new Error("build info unavailable")))
      .then(setBuildInfo)
      .catch(() => setBuildInfo(null));
  }, []);

  useEffect(() => {
    setLocale(localeFromBrowser());
    try { setCart(JSON.parse(localStorage.getItem("helpmey_luxury_cart") || "[]")); } catch { setCart([]); }
    fetch("/api/catalog", { cache:"no-store" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("catalog unavailable")))
      .then(data => { if (Array.isArray(data.products)) setInventory(data.products); })
      .catch(() => {});
  }, []);
  useEffect(() => { try { localStorage.setItem("helpmey_luxury_cart", JSON.stringify(cart)); } catch {} }, [cart]);

  const activeDepartment = departments.find(d => d.id === department)!;
  const products = useMemo(() => {
    const departmentWords: Record<string,string[]> = {
      sneakers:["sneaker","shoe","shoes","schuh"], smartphones:["smartphone","phone","telefon"], computers:["computer","laptop","notebook"],
      bluetooth:["bluetooth","audio","headphone","kopfhörer"], "womens-clothing":["damen","women","clothing","bekleidung"],
      innerwear:["underwear","innerwear","wäsche","unterwäsche"], eveningwear:["evening","abend","dress","kleid"],
      "mens-suits":["suit","anzug","menswear","herren"], perfumes:["perfume","parfum","fragrance","duft"],
      watches:["watch","uhr"], "womens-bags":["bag","tasche","handbag"], sportswear:["sport","sportswear","leggings"]
    };
    const terms = departmentWords[department] || [department];
    const matched = inventory.filter(p => terms.some(term => (p.category || "").toLowerCase().includes(term)));
    return matched.slice(0,20);
  }, [inventory, department]);
  const cartCount = cart.reduce((n,line) => n + line.quantity, 0);
  const subtotal = cart.reduce((n,line) => n + (line.product.price || 0) * line.quantity, 0);
  const openProduct = (product: Product) => { setSelected(product); setSize(product.sizes?.[0] || ""); setColor(product.colors?.[0] || ""); setQuantity(1); setStep("product"); };
  const addToCart = () => {
    if (!selected) return;
    const id = [selected.id,size,color].join("::");
    setCart(old => old.some(line => line.id === id)
      ? old.map(line => line.id === id ? {...line,quantity:line.quantity+quantity} : line)
      : [...old,{id,product:selected,size,color,quantity}]);
    setStep("summary");
  };

  return <div className="luxury-store" dir={rtl ? "rtl" : "ltr"}>
    <div className="luxury-topline">{t.tagline}<span>✧ &nbsp; HELPMEY &nbsp; ✧</span><span>EST. 2025</span></div>
    <header className="luxury-header">
      <a className="luxury-logo" href="#home" aria-label="Helpmey"><Crown size={23}/><span>HELPMEY</span><small>THE LUXURY EDIT</small></a>
      <div className="luxury-actions">
        <label className="luxury-language"><Globe2 size={15}/><select value={locale} onChange={e=>setLocale(e.target.value as Locale)} aria-label={t.language}><option value="DE">Deutsch</option><option value="EN">English</option><option value="AR">العربية</option></select></label>
        <button onClick={()=>setCartOpen(true)} className="luxury-cart"><ShoppingBag size={17}/><span>{t.cart}</span><b>{cartCount}</b></button>
      </div>
    </header>
    <nav className="luxury-departments" aria-label={t.all}>
      {departments.map(item => { const Icon = item.icon; return <button key={item.id} className={department===item.id?"active":""} onClick={()=>{setDepartment(item.id);setStep("catalog");}}><Icon size={19}/><span>{item[locale.toLowerCase() as "de"|"en"|"ar"]}</span></button>; })}
    </nav>

    {step === "catalog" && <>
      <section className="luxury-hero" id="home">
        <div className="luxury-hero-copy"><div className="luxury-kicker">{activeDepartment[locale.toLowerCase() as "de"|"en"|"ar"]} &nbsp; · &nbsp; {t.tagline}</div><h1>{t.headline}</h1><p>{t.intro}</p><a href="#collection" className="luxury-primary">{t.explore}<ArrowRight size={15}/></a></div>
        <div className="luxury-seal"><Crown size={35}/><span>H</span><small>HELPMEY</small></div>
      </section>
      <main className="luxury-main" id="collection">
        <div className="luxury-section-head"><div><span className="luxury-kicker">{t.inventory}</span><h2>{activeDepartment[locale.toLowerCase() as "de"|"en"|"ar"]}</h2></div><label className="luxury-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t.search}/></label></div>
        <div className="luxury-product-grid">
          {Array.from({length:20},(_,i)=> {
            const product = products.filter(p=>(p.title+" "+p.category).toLowerCase().includes(search.toLowerCase()))[i];
            const template: Product = product || {id:department+"-template-"+(i+1),title:"",category:department};
            return <button key={template.id} className="luxury-product-card" onClick={()=>openProduct(template)}>
              <span className="luxury-product-frame"><span className="luxury-product-ornament">✧</span>{product?.imageUrl ? <img src={product.imageUrl} alt={product.title}/> : <span className="luxury-product-placeholder"><Package size={27}/><small>{t.placeholder}</small><b>{String(i+1).padStart(2,"0")}</b></span>}<span className="luxury-quick-view">{t.select} <ArrowRight size={13}/></span></span>
              <span className="luxury-product-meta"><span>{product?.title || "—"}</span><span>{t.size}: — &nbsp; · &nbsp; {t.color}: —</span><strong>{money(product?.price,product?.currency)}</strong></span>
            </button>;
          })}
        </div>
        <p className="luxury-note">{products.length ? "" : t.unavailable}</p>
      </main>
    </>}

    {step === "product" && selected && <main className="luxury-flow"><button className="luxury-back" onClick={()=>setStep("catalog")}><ArrowLeft size={15}/>{t.back}</button><div className="luxury-product-detail"><div className="luxury-detail-visual">{selected.imageUrl?<img src={selected.imageUrl} alt={selected.title}/>:<div className="luxury-empty-art"><Crown size={48}/><span>HELPMEY</span></div>}</div><section className="luxury-detail-info"><span className="luxury-kicker">{activeDepartment[locale.toLowerCase() as "de"|"en"|"ar"]}</span><h1>{selected.title || activeDepartment[locale.toLowerCase() as "de"|"en"|"ar"]}</h1><p>{selected.description || t.unavailable}</p><strong className="luxury-detail-price">{money(selected.price,selected.currency)}</strong><label>{t.size}<select value={size} onChange={e=>setSize(e.target.value)}><option value="">—</option>{(selected.sizes || []).map(v=><option key={v}>{v}</option>)}</select></label><label>{t.color}<select value={color} onChange={e=>setColor(e.target.value)}><option value="">—</option>{(selected.colors || []).map(v=><option key={v}>{v}</option>)}</select></label><label>{t.quantity}<span className="luxury-quantity"><button onClick={()=>setQuantity(Math.max(1,quantity-1))}><Minus size={14}/></button>{quantity}<button onClick={()=>setQuantity(Math.min(99,quantity+1))}><Plus size={14}/></button></span></label><button className="luxury-primary full" onClick={addToCart}>{t.continue}<ArrowRight size={15}/></button></section></div></main>}

    {step === "summary" && selected && <main className="luxury-flow"><span className="luxury-kicker">{t.summary}</span><h1>{t.summary}</h1><section className="luxury-summary-card"><div className="luxury-summary-monogram"><Crown size={34}/></div><div><span>{t.type}</span><h2>{activeDepartment[locale.toLowerCase() as "de"|"en"|"ar"]}</h2><p>{selected.title || activeDepartment[locale.toLowerCase() as "de"|"en"|"ar"]}</p><p>{t.size}: {size || "—"} &nbsp; · &nbsp; {t.color}: {color || "—"}</p></div><div className="luxury-summary-count"><span>{t.count}</span><strong>{quantity}</strong><small>{money(selected.price,selected.currency)}</small></div></section><div className="luxury-flow-actions"><button className="luxury-back" onClick={()=>setStep("product")}><ArrowLeft size={15}/>{t.back}</button><button className="luxury-primary" onClick={()=>setStep("checkout")}>{t.confirm}<ArrowRight size={15}/></button></div></main>}

    {step === "checkout" && <main className="luxury-flow"><span className="luxury-kicker">{t.secure}</span><h1>{t.checkout}</h1><div className="luxury-checkout-grid"><section className="luxury-payment-card"><div className="luxury-payment-head"><ShieldCheck/><span>{t.payment}</span><CreditCard/></div><div className="luxury-chip"/><div className="luxury-card-number">•••• &nbsp; •••• &nbsp; •••• &nbsp; ••••</div><div className="luxury-card-foot"><span>HELPMEY MEMBER</span><Crown size={24}/></div></section><section className="luxury-order-card"><h2>{t.summary}</h2>{cart.map(line=><div className="luxury-order-line" key={line.id}><span>{line.product.title || line.product.category} × {line.quantity}</span><strong>{money((line.product.price||0)*line.quantity,line.product.currency)}</strong></div>)}<div className="luxury-order-total"><span>{t.subtotal}</span><strong>{money(subtotal)}</strong></div><p>{t.demo}</p><button className="luxury-primary full" disabled>{t.pay}<ShieldCheck size={15}/></button></section></div></main>}

    <footer className="luxury-footer"><Crown size={21}/><span>HELPMEY</span><small>TIMELESS BY DESIGN · EST. 2025</small>{buildInfo && <small className="luxury-build-meta">BUILD {buildInfo.version} · {buildInfo.commit.slice(0, 7)} · {buildInfo.environment}</small>}</footer>

    {cartOpen && <div className="luxury-overlay" onClick={()=>setCartOpen(false)}><aside className="luxury-cart-panel" onClick={e=>e.stopPropagation()}><button className="luxury-close" onClick={()=>setCartOpen(false)}><X/></button><span className="luxury-kicker">{t.cart}</span><h2>{t.cart}</h2>{cart.length===0?<p>{t.empty}</p>:cart.map(line=><div className="luxury-order-line" key={line.id}><span>{line.product.title || line.product.category} · {line.size} · {line.color} × {line.quantity}</span><strong>{money((line.product.price||0)*line.quantity,line.product.currency)}</strong></div>)}<div className="luxury-order-total"><span>{t.subtotal}</span><strong>{money(subtotal)}</strong></div><button className="luxury-primary full" disabled={!cart.length} onClick={()=>{setCartOpen(false);setStep("checkout")}}>{t.checkout}<ArrowRight size={15}/></button></aside></div>}
  </div>;
}
