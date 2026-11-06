"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const [password,setPassword] = useState("");
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage("Ihr Passwort wurde aktualisiert. Sie können sich jetzt im Helpmey-Shop anmelden.");
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Das Passwort konnte nicht aktualisiert werden.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto mt-20 w-[min(92%,480px)] border border-[#c5a88055] bg-[#171512] p-8">
    <p className="text-[10px] uppercase tracking-[.3em] text-[#c5a880]">Helpmey account security</p>
    <h1 className="serif my-4 text-3xl">Neues Passwort</h1>
    <form onSubmit={submit} className="grid gap-4">
      <label className="grid gap-2 text-xs text-[#c5a880]">Neues Passwort (mindestens 12 Zeichen)
        <input className="field" type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)}/>
      </label>
      <button className="gold-button" disabled={busy}>{busy?"Bitte warten …":"Passwort speichern"}</button>
    </form>
    {message&&<p className="mt-4 text-sm text-[#e4c995]">{message}</p>}
    <a className="mt-6 inline-block text-xs text-[#c5a880] underline" href="/">Zurück zu Helpmey</a>
  </main>;
}