import { useState } from "react";
import { supabase } from "../lib/supabase";
import { errorText } from "../lib/util";

const redirectTo = () => window.location.href.split("#")[0];

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        if (!data.session) setInfo("שלחנו לכם אימייל לאישור החשבון. אחרי הלחיצה על הקישור תחזרו לכאן מחוברים.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
        if (error) throw error;
        setInfo("אם קיים חשבון עם האימייל הזה, שלחנו אליו קישור לאיפוס הסיסמה.");
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen center">
      <div className="auth">
        <h1 className="logo">בייבי<span>סוויפ</span></h1>
        <p className="lead">מוצאים בייביסיטר זמין קרוב אליכם, בהחלקה.</p>
        {mode !== "reset" && (
          <div className="seg" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => setMode("login")}>התחברות</button>
            <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => setMode("signup")}>הרשמה</button>
          </div>
        )}
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>אימייל</span>
            <input id="auth-email" type="email" required autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== "reset" && (
            <label className="field">
              <span>סיסמה</span>
              <input id="auth-password" type="password" required minLength={6} dir="ltr"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          {error && <p className="error">{error}</p>}
          {info && <p className="info">{info}</p>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "רגע…" : mode === "login" ? "התחברות" : mode === "signup" ? "יצירת חשבון" : "שליחת קישור לאיפוס"}
          </button>
        </form>
        {mode === "login" && <button className="link" type="button" onClick={() => setMode("reset")}>שכחתי סיסמה</button>}
        {mode === "reset" && <button className="link" type="button" onClick={() => setMode("login")}>חזרה להתחברות</button>}
      </div>
    </div>
  );
}

export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(errorText(error)); else onDone();
  }
  return (
    <div className="screen center">
      <form className="auth form" onSubmit={submit}>
        <h2>בחירת סיסמה חדשה</h2>
        <label className="field">
          <span>סיסמה חדשה</span>
          <input id="new-password" type="password" required minLength={6} dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>שמירת הסיסמה</button>
      </form>
    </div>
  );
}
