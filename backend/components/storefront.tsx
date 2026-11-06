"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { User } from "@supabase/supabase-js";
import { Heart, Search, ShoppingBag, UserRound, X, Plus, Minus, Globe, Menu, Crown, ArrowRight, ShieldCheck, Mail } from "lucide-react";

type Product = { id: string; category: string; title: string; description: string; price: number; symbol: string; sizes: string[]; colors: string[]; imageUrl?: string | null; currency?: string };
type CartLine = { key: string; product: Product; size: string; color: string; quantity: number };
type Language = "DE" | "EN" | "AR" | "FR" | "ES" | "IT" | "TR" | "NL";
const products: Product[] = [
  { id: "leggings", category: "SPORTBEKLEIDUNG · BESTSELLER", title: "Performance Leggings", description: "High-waist, blickdichte Stretch-Leggings mit angenehmem Halt.", price: 68, symbol: "✧", sizes: ["XS","S","M","L","XL"], colors: ["Schwarz","Sand","Olive"] },
  { id: "tote", category: "TASCHEN · BESTSELLER", title: "City Leather Tote", description: "Strukturierte Alltagstasche aus pflanzlich gegerbtem Leder.", price: 210, symbol: "◈", sizes: ["One Size"], colors: ["Cognac","Schwarz","Creme"] },
  { id: "watch", category: "UHREN · BESTSELLER", title: "Noir Chronograph", description: "Matter Chronograph mit Saphirglas und Edelstahlgehäuse.", price: 349, symbol: "◷", sizes: ["One Size"], colors: ["Schwarz","Silber"] },
  { id: "gift", category: "GESCHENKE · BESTSELLER", title: "Signature Discovery Box", description: "Vier Miniaturdüfte in einer hochwertigen Geschenkbox.", price: 89, symbol: "❖", sizes: ["One Size"], colors: ["Signature"] }
];
const copy: Record<Language, { home: string; shop: string; offers: string; about: string; collections: string; more: string; headline: string; intro: string; cta: string; featured: string; featuredText: string; newsletter: string; newsletterText: string; subscribe: string; cart: string; empty: string; add: string; login: string; signup: string; email: string; password: string; forgot: string; logout: string; wishlist: string; search: string; legal: string }> = {
  DE: { home:"Startseite",shop:"Shop",offers:"Angebote",about:"Über uns",collections:"Kollektionen",more:"Mehr",headline:"Alltagsstücke, mit Bedacht gefertigt.",intro:"Helpmey ist ein kuratierter Store für zeitlose Essentials – Naturfasern, ehrliche Keramik und leise Accessoires, gemacht für weit mehr als eine Saison.",cta:"Jetzt shoppen",featured:"Ausgewählte Stücke",featuredText:"Weniger, aber besser. Entdecken Sie unsere Favoriten.",newsletter:"Bleiben Sie informiert",newsletterText:"Früher Zugang, Restock-News, kein Lärm.",subscribe:"Zur Liste",cart:"Warenkorb",empty:"Ihr Warenkorb ist noch leer.",add:"In den Warenkorb",login:"Anmelden",signup:"Konto erstellen",email:"E-Mail-Adresse",password:"Passwort",forgot:"Passwort vergessen?",logout:"Abmelden",wishlist:"Merkliste",search:"Produkte suchen …",legal:"Rechtliches" },
  EN: { home:"Home",shop:"Shop",offers:"Offers",about:"About",collections:"Collections",more:"More",headline:"Everyday pieces, thoughtfully made.",intro:"Helpmey is a curated store for timeless essentials — natural fibres, honest ceramics and quiet accessories designed to last beyond a season.",cta:"Shop now",featured:"Selected pieces",featuredText:"Fewer, better things. Discover our favourites.",newsletter:"Stay informed",newsletterText:"Early access, restock news, no noise.",subscribe:"Subscribe",cart:"Shopping bag",empty:"Your bag is empty.",add:"Add to bag",login:"Sign in",signup:"Create account",email:"Email address",password:"Password",forgot:"Forgot password?",logout:"Sign out",wishlist:"Wishlist",search:"Search products …",legal:"Legal" },
  AR: { home:"الرئيسية",shop:"المتجر",offers:"العروض",about:"من نحن",collections:"المجموعات",more:"المزيد",headline:"قطع يومية، صُنعت بعناية.",intro:"Helpmey متجر مختار لأساسيات خالدة تدوم لأكثر من موسم.",cta:"تسوق الآن",featured:"قطع مختارة",featuredText:"الأقل، والأفضل.",newsletter:"ابقَ على اطلاع",newsletterText:"وصول مبكر وأخبار إعادة التوفر.",subscribe:"اشترك",cart:"السلة",empty:"سلتك فارغة.",add:"أضف إلى السلة",login:"تسجيل الدخول",signup:"إنشاء حساب",email:"البريد الإلكتروني",password:"كلمة المرور",forgot:"نسيت كلمة المرور؟",logout:"تسجيل الخروج",wishlist:"المفضلة",search:"ابحث عن المنتجات …",legal:"معلومات قانونية" },
  FR: { home:"Accueil",shop:"Boutique",offers:"Offres",about:"À propos",collections:"Collections",more:"Plus",headline:"Des essentiels du quotidien, conçus avec soin.",intro:"Helpmey sélectionne des pièces intemporelles pensées pour durer.",cta:"Acheter",featured:"Pièces choisies",featuredText:"Moins, mais mieux.",newsletter:"Restez informé",newsletterText:"Accès anticipé et nouvelles disponibilités.",subscribe:"S’inscrire",cart:"Panier",empty:"Votre panier est vide.",add:"Ajouter au panier",login:"Connexion",signup:"Créer un compte",email:"Adresse e-mail",password:"Mot de passe",forgot:"Mot de passe oublié ?",logout:"Déconnexion",wishlist:"Favoris",search:"Rechercher …",legal:"Mentions légales" },
  ES: { home:"Inicio",shop:"Tienda",offers:"Ofertas",about:"Nosotros",collections:"Colecciones",more:"Más",headline:"Piezas cotidianas, hechas con cuidado.",intro:"Helpmey selecciona esenciales atemporales diseñados para durar.",cta:"Comprar",featured:"Piezas seleccionadas",featuredText:"Menos, pero mejor.",newsletter:"Mantente informado",newsletterText:"Acceso anticipado y novedades.",subscribe:"Suscribirme",cart:"Carrito",empty:"Tu carrito está vacío.",add:"Añadir al carrito",login:"Entrar",signup:"Crear cuenta",email:"Correo electrónico",password:"Contraseña",forgot:"¿Olvidaste tu contraseña?",logout:"Cerrar sesión",wishlist:"Favoritos",search:"Buscar productos …",legal:"Aviso legal" },
  IT: { home:"Home",shop:"Negozio",offers:"Offerte",about:"Chi siamo",collections:"Collezioni",more:"Altro",headline:"Essenziali quotidiani, realizzati con cura.",intro:"Helpmey seleziona pezzi senza tempo pensati per durare.",cta:"Acquista ora",featured:"Pezzi selezionati",featuredText:"Meno, ma meglio.",newsletter:"Resta informato",newsletterText:"Accesso anticipato e novità.",subscribe:"Iscriviti",cart:"Carrello",empty:"Il carrello è vuoto.",add:"Aggiungi al carrello",login:"Accedi",signup:"Crea account",email:"Indirizzo email",password:"Password",forgot:"Password dimenticata?",logout:"Esci",wishlist:"Preferiti",search:"Cerca prodotti …",legal:"Note legali" },
  TR: { home:"Ana sayfa",shop:"Mağaza",offers:"Teklifler",about:"Hakkımızda",collections:"Koleksiyonlar",more:"Daha fazla",headline:"Özenle tasarlanmış günlük parçalar.",intro:"Helpmey, uzun süre kullanmanız için zamansız ürünler seçer.",cta:"Alışverişe başla",featured:"Seçili parçalar",featuredText:"Daha az, daha iyi.",newsletter:"Haberdar olun",newsletterText:"Erken erişim ve stok haberleri.",subscribe:"Kaydol",cart:"Sepet",empty:"Sepetiniz boş.",add:"Sepete ekle",login:"Giriş yap",signup:"Hesap oluştur",email:"E-posta",password:"Şifre",forgot:"Şifrenizi mi unuttunuz?",logout:"Çıkış yap",wishlist:"Favoriler",search:"Ürün ara …",legal:"Yasal" },
  NL: { home:"Home",shop:"Winkel",offers:"Aanbiedingen",about:"Over ons",collections:"Collecties",more:"Meer",headline:"Alledaagse stukken, met aandacht gemaakt.",intro:"Helpmey selecteert tijdloze essentials die lang meegaan.",cta:"Nu winkelen",featured:"Geselecteerde stukken",featuredText:"Minder, maar beter.",newsletter:"Blijf op de hoogte",newsletterText:"Vroege toegang en voorraadnieuws.",subscribe:"Aanmelden",cart:"Winkelwagen",empty:"Je winkelwagen is leeg.",add:"In winkelwagen",login:"Inloggen",signup:"Account maken",email:"E-mailadres",password:"Wachtwoord",forgot:"Wachtwoord vergeten?",logout:"Uitloggen",wishlist:"Verlanglijst",search:"Producten zoeken …",legal:"Juridisch" }
};
const euro = (n: number) => new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(n);
const loadJson = <T,>(key: string, fallback: T): T => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };

export default function Storefront() {
  const [language,setLanguage] = useState<Language>("DE");
  const [query,setQuery] = useState("");
  const [category,setCategory] = useState("Alle");
  const [catalog,setCatalog] = useState<Product[]>(products);\n  const [cart,setCart] = useState<CartLine[]>([]);
  const [wishlist,setWishlist] = useState<string[]>([]);
  const [user,setUser] = useState<User|null>(null);
  const [modal,setModal] = useState<"auth"|"cart"|"product"|"wishlist"|"legal"|null>(null);
  const [authMode,setAuthMode] = useState<"login"|"signup"|"reset">("login");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [authMessage,setAuthMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [activeProduct,setActiveProduct] = useState<Product|null>(null);
  const [size,setSize] = useState("One Size");
  const [color,setColor] = useState("Schwarz");
  const [quantity,setQuantity] = useState(1);
  const [legalType,setLegalType] = useState("imprint");
  const t = copy[language];
  const isRtl = language === "AR";

  useEffect(() => {
    setCart(loadJson<CartLine[]>("helpmey_cart_v1",[]));
    setWishlist(loadJson<string[]>("helpmey_wishlist_v1",[]));
    try {
      const supabase = createSupabaseBrowserClient();
      supabase.auth.getUser().then(({data})=>setUser(data.user));
      const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user ?? null));
      return () => subscription.unsubscribe();
    } catch {
      setAuthMessage("Die Kontofunktion wird nach Konfiguration der Supabase-Umgebungsvariablen aktiviert.");
    }
  }, []);

  useEffect(()=>{ let cancelled=false; fetch("/api/catalog",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error("catalog unavailable"))).then(payload=>{ if(!cancelled && Array.isArray(payload.products) && payload.products.length){ setCatalog(payload.products.map((p: Omit<Product,"symbol">)=>({...p,symbol:"✧"}))); } }).catch(()=>{}); return ()=>{cancelled=true}; },[]);\n  useEffect(()=>{ try { localStorage.setItem("helpmey_cart_v1",JSON.stringify(cart)); } catch {} },[cart]);
  useEffect(()=>{ try { localStorage.setItem("helpmey_wishlist_v1",JSON.stringify(wishlist)); } catch {} },[wishlist]);

  const visibleProducts = useMemo(()=>catalog.filter(p=>(category==="Alle"||p.category.toLowerCase().includes(category.toLowerCase())) && (p.title+" "+p.category+" "+p.description).toLowerCase().includes(query.toLowerCase())),[catalog,category,query]);
  const cartCount = cart.reduce((sum,line)=>sum+line.quantity,0);
  const subtotal = cart.reduce((sum,line)=>sum+line.product.price*line.quantity,0);

  function toggleWishlist(id:string) { setWishlist(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]); }
  function openProduct(product:Product) { setActiveProduct(product);setSize(product.sizes[0] ?? "One Size");setColor(product.colors[0] ?? "Standard");setQuantity(1);setModal("product"); }
  function addToCart(product:Product,selectedSize:string,selectedColor:string,count:number) {
    const key=[product.id,selectedSize,selectedColor].join(":");
    setCart(old=>{const found=old.find(x=>x.key===key);return found?old.map(x=>x.key===key?{...x,quantity:Math.min(99,x.quantity+count)}:x):[...old,{key,product,size:selectedSize,color:selectedColor,quantity:count}]});
    setModal("cart");
  }
  async function submitAuth(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setAuthMessage("");
    try {
      const supabase=createSupabaseBrowserClient();
      if(authMode==="signup") {
        const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+"/auth/callback"}});
        if(error) throw error;
        setAuthMessage(data.session?"Konto erstellt. Sie sind angemeldet.":"Bitte bestätigen Sie Ihre E-Mail über den zugesandten Aktivierungslink.");
      } else if(authMode==="login") {
        const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
        setAuthMessage("Erfolgreich angemeldet.");setModal(null);
      } else {
        const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+"/auth/callback?next=/account/reset-password"});if(error)throw error;
        setAuthMessage("Wenn ein Konto existiert, wurde eine Anleitung zum Zurücksetzen versendet.");
      }
    } catch(error) { setAuthMessage(error instanceof Error?error.message:"Die Anfrage konnte nicht verarbeitet werden."); }
    finally { setBusy(false); }
  }
  async function signOut() { try { const supabase=createSupabaseBrowserClient();await supabase.auth.signOut();setUser(null);setAuthMessage("Sie wurden abgemeldet."); } catch { setAuthMessage("Abmeldung nicht verfügbar."); } }
  async function subscribe(event:React.FormEvent<HTMLFormElement>) { event.preventDefault();setAuthMessage("Newsletter-Anmeldung benötigt noch einen verbundenen Newsletter-Anbieter."); }

  return <div dir={isRtl?"rtl":"ltr"}>
    <header className="site-header">
      <div className="shell header-main">
        <a href="#home" className="brand-mark" aria-label="Helpmey Startseite"><Crown size={22}/><span className="brand-name">Helpmey</span><span className="brand-tag">EVERYDAY STORE</span></a>
        <div className="header-tools">
          <label className="flex items-center gap-2"><Globe size={15} className="gold-text"/><select aria-label="Language" className="field !min-h-9 !w-[74px] !px-2 text-xs" value={language} onChange={e=>setLanguage(e.target.value as Language)}>{(["DE","EN","AR","FR","ES","IT","TR","NL"] as Language[]).map(x=><option key={x}>{x}</option>)}</select></label>
          <button className="icon-action" onClick={()=>setModal("wishlist")} aria-label={t.wishlist}><Heart size={18}/><span>{wishlist.length}</span></button>
          <button className="icon-action" onClick={()=>{setAuthMessage("");setModal("auth")}} aria-label={t.login}><UserRound size={18}/><span>{user?user.email?.split("@")[0]:t.login}</span></button>
          <button className="icon-action" onClick={()=>setModal("cart")} aria-label={t.cart}><ShoppingBag size={18}/><span>{t.cart} ({cartCount})</span></button>
        </div>
      </div>
      <nav className="header-nav shell" aria-label="Hauptnavigation">
        <a href="#home">{t.home}</a><a href="#shop">{t.shop}</a><a href="#shop" className="gold-text">• {t.offers}</a><a href="#about">{t.about}</a>
        <details className="nav-dropdown"><summary>{t.collections}</summary><div className="dropdown-panel">{["Parfums","Geschenke","Uhren","Taschen","Sportbekleidung"].map(x=><a key={x} href="#shop" onClick={()=>setCategory(x)}>{x}</a>)}</div></details>
        <details className="nav-dropdown"><summary>{t.more}</summary><div className="dropdown-panel"><a href="#contact">Geschenkkarte</a><a href="#contact">Bestellung verfolgen</a><a href="#contact">Kontakt</a><a href="#contact">Versand & Rückgabe</a></div></details>
      </nav>
    </header>

    <main>
      <section className="hero" id="home">
        <div className="shell hero-copy">
          <div className="eyebrow">Helpmey · Luxury beyond limits</div>
          <h1>{t.headline}</h1>
          <p>{t.intro}</p>
          <div className="mt-7 flex flex-wrap gap-3"><a className="gold-button" href="#shop">{t.cta}<ArrowRight size={15}/></a><a className="outline-button" href="#about">{t.about}</a></div>
        </div>
        <div className="hero-no-image" aria-hidden="true"/>
        <img className="hero-image" src="/helpmey-palace-hero.jpg" alt="Helpmey luxury palace storefront with marble facade and golden lighting" onError={e=>{e.currentTarget.style.display="none"}}/>
      </section>

      <section className="section shell" id="shop">
        <div className="section-heading"><div><div className="eyebrow">Curated everyday luxury</div><h2>{t.featured}</h2></div><p>{t.featuredText}</p></div>
        <div className="mb-5 flex flex-wrap items-center gap-3"><label className="relative flex min-w-[220px] flex-1 items-center"><Search size={15} className="absolute left-3 text-[#c5a880]"/><input className="field pl-9" placeholder={t.search} value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="category-row !mb-0">{["Alle","Sportbekleidung","Taschen","Uhren","Geschenke"].map(c=><button key={c} className="category-chip" aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div></div>
        <div className="product-grid">{visibleProducts.map(product=><article className="product-card" key={product.id}>
          <div className="product-photo">{product.imageUrl?<img src={product.imageUrl} alt={product.title} loading="lazy"/>:<span className="product-placeholder">{product.symbol}</span>}<span className="product-badge">BESTSELLER</span><button className="wish-button" aria-label="Zur Merkliste" aria-pressed={wishlist.includes(product.id)} onClick={()=>toggleWishlist(product.id)}><Heart size={16} fill={wishlist.includes(product.id)?"currentColor":"none"}/></button></div>
          <div className="product-info"><div className="product-category">{product.category}</div><h3>{product.title}</h3><p>{product.description}</p><div className="product-buy"><span className="product-price">{euro(product.price)}</span><button className="small-add" onClick={()=>openProduct(product)}><Plus size={13}/>{t.add}</button></div></div>
        </article>)}</div>
      </section>

      <section className="shell section !pt-0" id="about"><div className="eyebrow">Our philosophy</div><h2 className="serif mt-3 text-3xl font-normal">Weniger, aber besser.</h2><p className="mt-3 max-w-2xl text-sm leading-8 text-[#b9b0a3]">Helpmey steht für ausgewählte Stücke, ehrliche Materialien und zeitloses Design. Wir bevorzugen Qualität, die im Alltag Bestand hat – und Dinge, die man gerne lange behält.</p></section>

      <section className="shell newsletter-block" id="contact"><div><div className="eyebrow">The Helpmey letter</div><h2>{t.newsletter}</h2><p className="text-xs text-[#b9b0a3]">{t.newsletterText}</p></div><form className="newsletter-form" onSubmit={subscribe}><input className="field" type="email" required placeholder="you@example.com" aria-label={t.email}/><button className="gold-button" type="submit"><Mail size={14}/>{t.subscribe}</button></form></section>
    </main>

    <footer className="site-footer"><div className="shell"><div className="footer-grid">
      <div><div className="brand-mark !items-start"><Crown size={20}/><span className="brand-name !text-2xl">Helpmey</span><span className="brand-tag">EVERYDAY STORE</span></div><p>Zeitlose Essentials, Naturfasern und ausgewählte Accessoires – mit Bedacht kuratiert.</p><div className="trust-line flex items-center gap-2"><ShieldCheck size={15}/> Sicherer Checkout nach Zahlungsintegration</div></div>
      <div><h3>Entdecken</h3><a href="#home">{t.home}</a><a href="#shop">{t.shop}</a><a href="#shop">{t.offers}</a><button className="text-left text-xs text-[#b9b0a3]" onClick={()=>setModal("wishlist")}>{t.wishlist}</button></div>
      <div><h3>Kundenservice</h3><a href="mailto:contact@digital-future.ai">Kontakt</a><a href="#contact">Versand & Rückgabe</a><a href="mailto:info@digital-future.ai">Bestellanfragen</a><a href="mailto:server@digital-future.ai">Systemkontakt</a></div>
      <div><h3>{t.legal}</h3><button className="block py-1 text-left text-xs text-[#b9b0a3]" onClick={()=>{setLegalType("imprint");setModal("legal")}}>Impressum</button><button className="block py-1 text-left text-xs text-[#b9b0a3]" onClick={()=>{setLegalType("privacy");setModal("legal")}}>Datenschutz</button><button className="block py-1 text-left text-xs text-[#b9b0a3]" onClick={()=>{setLegalType("terms");setModal("legal")}}>AGB</button><button className="block py-1 text-left text-xs text-[#b9b0a3]" onClick={()=>{setLegalType("withdrawal");setModal("legal")}}>Widerruf</button></div>
    </div><div className="footer-bottom"><span>© {new Date().getFullYear()} Helpmey · digital future</span><span>Visa · Mastercard · PayPal · Stripe · Apple Pay · Google Pay · Klarna</span></div></div></footer>

    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null)}}><section className="modal-panel" role="dialog" aria-modal="true" aria-label="Helpmey Dialog"><button className="modal-close" onClick={()=>setModal(null)} aria-label="Schließen"><X/></button>
      {modal==="auth" && <><div className="eyebrow">Helpmey account</div><h2>{user?user.email:t[authMode==="signup"?"signup":"login"]}</h2>{user?<div className="form-stack"><p className="form-message">Sie sind mit einem bestätigten Supabase-Konto angemeldet.</p><button className="outline-button" onClick={signOut}>{t.logout}</button></div>:<form className="form-stack" onSubmit={submitAuth}><label>{t.email}<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>{authMode!=="reset"&&<label>{t.password}<input type="password" minLength={12} autoComplete={authMode==="signup"?"new-password":"current-password"} required value={password} onChange={e=>setPassword(e.target.value)}/></label>}<button className="gold-button" disabled={busy}>{busy?"Bitte warten …":t[authMode==="signup"?"signup": "login"]}</button><div className="flex flex-wrap gap-3 text-xs text-[#c5a880]"><button type="button" onClick={()=>{setAuthMode("login");setAuthMessage("")}}>{t.login}</button><button type="button" onClick={()=>{setAuthMode("signup");setAuthMessage("")}}>{t.signup}</button><button type="button" onClick={()=>{setAuthMode("reset");setAuthMessage("")}}>{t.forgot}</button></div></form>}{authMessage&&<p className="form-message mt-4">{authMessage}</p>}</>}
      {modal==="product"&&activeProduct&&<><div className="eyebrow">{activeProduct.category}</div><h2>{activeProduct.title}</h2><p className="text-sm text-[#b9b0a3]">{activeProduct.description}</p><p className="product-price my-4">{euro(activeProduct.price)}</p><div className="form-stack"><label>Größe / Modell<select value={size} onChange={e=>setSize(e.target.value)}>{activeProduct.sizes.map(x=><option key={x}>{x}</option>)}</select></label><label>Farbe<select value={color} onChange={e=>setColor(e.target.value)}>{activeProduct.colors.map(x=><option key={x}>{x}</option>)}</select></label><label>Menge<div className="flex items-center gap-4"><button type="button" className="outline-button" onClick={()=>setQuantity(Math.max(1,quantity-1))}><Minus size={14}/></button>{quantity}<button type="button" className="outline-button" onClick={()=>setQuantity(Math.min(99,quantity+1))}><Plus size={14}/></button></div></label><p className="form-message">Gesamt: {euro(activeProduct.price*quantity)}</p><button className="gold-button" onClick={()=>addToCart(activeProduct,size,color,quantity)}>{t.add}</button></div></>}
      {modal==="cart"&&<><div className="eyebrow">{t.cart}</div><h2>{t.cart}</h2>{cart.length===0?<p className="text-sm text-[#b9b0a3]">{t.empty}</p>:<>{cart.map(line=><div className="cart-row" key={line.key}><div><strong>{line.product.title}</strong><div className="text-[10px] text-[#b9b0a3]">{line.size} · {line.color} · {line.quantity} × {euro(line.product.price)}</div></div><div className="flex items-center gap-2"><strong>{euro(line.product.price*line.quantity)}</strong><button aria-label="Entfernen" onClick={()=>setCart(old=>old.filter(x=>x.key!==line.key))}><X size={15}/></button></div></div>)}<div className="cart-total"><span>Zwischensumme</span><strong>{euro(subtotal)}</strong></div><p className="form-message">Demo-Warenkorb: Checkout und Zahlungsabwicklung werden erst nach Einrichtung eines geprüften Zahlungs-Backends aktiviert.</p></>}</>}
      {modal==="wishlist"&&<><div className="eyebrow">{t.wishlist}</div><h2>{t.wishlist}</h2>{wishlist.length===0?<p className="text-sm text-[#b9b0a3]">Noch keine Favoriten gespeichert.</p>:products.filter(p=>wishlist.includes(p.id)).map(p=><div className="cart-row" key={p.id}><span>{p.title}</span><strong>{euro(p.price)}</strong><button onClick={()=>toggleWishlist(p.id)}><X size={14}/></button></div>)}</>}
      {modal==="legal"&&<><div className="eyebrow">Helpmey · {t.legal}</div><h2>{legalType==="imprint"?"Impressum":legalType==="privacy"?"Datenschutz":legalType==="terms"?"AGB":"Widerruf"}</h2>{legalType==="imprint"?<div className="text-xs leading-7 text-[#c9c0b4]"><p><strong>Betreiber:</strong> digital future (Inhaber: Ahmed Ismail Saed)</p><p><strong>Anschrift:</strong> Ehndorfer Str. 130, 24537 Neumünster, Deutschland</p><p><strong>Kontakt:</strong> contact@digital-future.ai · info@digital-future.ai</p><p><strong>Umsatzsteuer:</strong> Kleinunternehmer gemäß § 19 UStG.</p><p><strong>Hinweis:</strong> Angaben nach § 5 DDG. Hinweis zur EU-Online-Streitbeilegung gemäß Art. 14 Abs. 1 ODR-VO ist entsprechend der aktuellen Rechtslage zu prüfen.</p></div>:<p className="text-xs leading-7 text-[#c9c0b4]">Diese Rechtstexte müssen vor Veröffentlichung anhand der tatsächlichen Geschäftsabläufe und der geltenden deutschen und europäischen Vorschriften rechtlich geprüft und vollständig ergänzt werden. Es werden hier keine nicht geprüften Vertrags- oder Datenschutzversprechen abgegeben.</p>}</>}
    </section></div>}
  </div>;
}