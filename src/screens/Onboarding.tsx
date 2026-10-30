import { useState } from "react";
import { supabase } from "../lib/supabase";
import type { Role } from "../lib/types";
import { errorText } from "../lib/util";

export function Onboarding({ userId, suggestedName = "", onDone }: { userId: string; suggestedName?: string; onDone: () => void }) {
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState(suggestedName.slice(0, 40));
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!role) return;
    setBusy(true); setError(null);
    const { error } = await supabase.from("profiles").insert({ id: userId, role, display_name: name.trim() });
    setBusy(false);
    if (error) setError(errorText(error)); else onDone();
  }

  return (
    <div className="screen center">
      <form className="auth form" onSubmit={submit}>
        <h2>ברוכים הבאים</h2>
        <p className="lead">איך תשתמשו באפליקציה?</p>
        <div className="roles">
          <button type="button" className={"role" + (role === "parent" ? " on" : "")} aria-pressed={role === "parent"} onClick={() => setRole("parent")}>
            <b>אני מחפש/ת בייביסיטר</b>
            <span>החלקה, מפה והודעות לבייביסיטרים באזור</span>
          </button>
          <button type="button" className={"role" + (role === "sitter" ? " on" : "")} aria-pressed={role === "sitter"} onClick={() => setRole("sitter")}>
            <b>אני בייביסיטר</b>
            <span>פרופיל, מחיר וזמינות. הורים פונים אליכם בהודעה</span>
          </button>
        </div>
        <label className="field">
          <span>השם שיוצג</span>
          <input id="onb-name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: נועה" />
        </label>
        <label className="check">
          <input id="onb-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
          <span>אני בן/בת 16 ומעלה ומאשר/ת את תנאי השימוש ומדיניות הפרטיות</span>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={!role || !agree || busy}>המשך</button>
        <p className="small">התפקיד נקבע פעם אחת. אפשר לשנות את השם בכל זמן.</p>
      </form>
    </div>
  );
}
