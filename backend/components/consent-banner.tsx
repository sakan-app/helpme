"use client";

import { useEffect, useState } from "react";

// Cookie consent: the Google tag GTM-W976JXRM (Google Analytics) loads only after "Accept" (TDDDG § 25 /
// DSGVO Art. 6 (1) a). "Decline" is equally easy; the footer's "Cookie-Einstellungen" button dispatches
// OPEN_EVENT to show the choice again.
const KEY = "helpmey_consent_v1";
const TAG_ID = "GTM-W976JXRM";
export const OPEN_EVENT = "helpmey:cookie-settings";

const TEXT: Record<string, { text: string; accept: string; decline: string }> = {
  de: { text: "Wir möchten mit Google Analytics messen, wie unser Shop genutzt wird. Dafür werden Cookies gesetzt und Daten an Google übertragen – nur mit Ihrer Zustimmung. Sie können sie jederzeit unter „Cookie-Einstellungen“ ändern.", accept: "Akzeptieren", decline: "Ablehnen" },
  en: { text: "We would like to measure how our shop is used with Google Analytics. This sets cookies and sends data to Google – only with your consent. You can change it any time under “Cookie-Einstellungen”.", accept: "Accept", decline: "Decline" },
  ar: { text: "نود قياس كيفية استخدام متجرنا عبر Google Analytics. يتم ذلك بوضع ملفات تعريف الارتباط وإرسال بيانات إلى Google، وفقط بموافقتك. يمكنك تغيير اختيارك في أي وقت من „Cookie-Einstellungen“.", accept: "موافقة", decline: "رفض" }
};

type Win = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; __gtagLoaded?: boolean };

function loadTag() {
  const w = window as Win;
  if (w.__gtagLoaded) return;
  w.__gtagLoaded = true;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () { w.dataLayer!.push(arguments); };
  w.gtag("js", new Date());
  // Created by this nonce-trusted bundle, so the CSP's 'strict-dynamic' lets it (and what it loads) run.
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${TAG_ID}`;
  document.head.appendChild(script);
}

const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const save = (value: string) => { try { localStorage.setItem(KEY, value); } catch { /* private mode */ } };

export default function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState("de");

  useEffect(() => {
    const choice = read();
    if (choice === "granted") loadTag();
    else if (choice !== "denied") setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);
  useEffect(() => { if (open) setLang((document.documentElement.lang || "de").slice(0, 2)); }, [open]);

  if (!open) return null;
  const t = TEXT[lang] ?? TEXT.de;
  return <div className="hm-consent" role="region" aria-label="Cookie-Hinweis">
    <p>{t.text}</p>
    <div className="hm-consent-actions">
      <button type="button" onClick={() => {
        // Withdrawing after Google was loaded needs a reload so its scripts are gone.
        const loaded = (window as Win).__gtagLoaded;
        save("denied"); setOpen(false);
        if (loaded) location.reload();
      }}>{t.decline}</button>
      <button type="button" onClick={() => { save("granted"); setOpen(false); loadTag(); }}>{t.accept}</button>
    </div>
  </div>;
}
