import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { errorText, shrinkImage, toast } from "../lib/util";
import { VerifiedBadge } from "./Badges";

interface Request { status: "pending" | "approved" | "rejected"; reject_reason: string | null; created_at: string }

export function VerificationSection({ userId, verified, onChanged }: { userId: string; verified: boolean; onChanged: () => void }) {
  const [last, setLast] = useState<Request | null | undefined>(undefined);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => supabase.from("verification_requests").select("status, reject_reason, created_at")
    .order("created_at", { ascending: false }).limit(1).maybeSingle()
    .then(({ data }) => setLast((data as Request) ?? null));
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!idFile || !selfie) return;
    setBusy(true);
    try {
      const key = crypto.randomUUID();
      const idPath = `${userId}/${key}-id.jpg`;
      const selfiePath = `${userId}/${key}-selfie.jpg`;
      const bucket = supabase.storage.from("id-documents");
      const up1 = await bucket.upload(idPath, await shrinkImage(idFile), { contentType: "image/jpeg" });
      if (up1.error) throw up1.error;
      const up2 = await bucket.upload(selfiePath, await shrinkImage(selfie), { contentType: "image/jpeg" });
      if (up2.error) throw up2.error;
      const { error } = await supabase.from("verification_requests").insert({ id_path: idPath, selfie_path: selfiePath });
      if (error) throw error;
      toast("הבקשה נשלחה. נעדכן אחרי הבדיקה");
      setIdFile(null); setSelfie(null); setAgree(false);
      load(); onChanged();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="item">
      <h3>אימות זהות</h3>
      {verified ? (
        <p className="sub"><VerifiedBadge /> הזהות שלכם אומתה. התג מוצג למשתמשים אחרים.</p>
      ) : last === undefined ? (
        <p className="sub">טוען…</p>
      ) : last?.status === "pending" ? (
        <p className="sub">הבקשה שלכם בבדיקה. בדרך כלל זה לוקח עד יום עבודה.</p>
      ) : (
        <form className="form" onSubmit={submit}>
          {last?.status === "rejected" && <p className="error">הבקשה הקודמת נדחתה{last.reject_reason ? `: ${last.reject_reason}` : ""}. אפשר לשלוח שוב.</p>}
          <p className="sub">משתמשים מאומתים מקבלים תג "מאומת/ת", והורים יכולים לסנן לפיו. צלמו את תעודת הזהות ותמונת סלפי של הפנים.</p>
          <label className="field"><span>צילום תעודת הזהות (הצד עם התמונה)</span>
            <input id="ver-id" type="file" accept="image/*" capture="environment" required onChange={(e) => setIdFile(e.target.files?.[0] ?? null)} /></label>
          <label className="field"><span>סלפי</span>
            <input id="ver-selfie" type="file" accept="image/*" capture="user" required onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} /></label>
          <label className="check">
            <input id="ver-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
            <span>אני מסכים/ה שהתמונות ישמשו רק לאימות הזהות. הן נשמרות באופן מאובטח, נבדקות ידנית על ידי צוות בייביסוויפ ונמחקות מיד אחרי הבדיקה.</span>
          </label>
          <button className="btn yes" type="submit" disabled={!idFile || !selfie || !agree || busy}>{busy ? "שולחים…" : "שליחה לאימות"}</button>
        </form>
      )}
    </section>
  );
}
