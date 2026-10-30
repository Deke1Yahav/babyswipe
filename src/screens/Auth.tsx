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

  async function google() {
    setBusy(true); setError(null); setInfo(null);
    // Leaves the page for Google's sign-in and comes back here with a session.
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (error) { setError(errorText(error)); setBusy(false); }
  }

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
          <>
            <button className="google" type="button" disabled={busy} onClick={google}>
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              המשך עם Google
            </button>
            <div className="or"><span>או עם אימייל</span></div>
          </>
        )}
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
