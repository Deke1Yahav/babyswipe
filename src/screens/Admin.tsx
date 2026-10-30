import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { errorText, fmtTime, toast } from "../lib/util";

interface Pending { id: number; user_id: string; display_name: string; role: "parent" | "sitter"; id_path: string; selfie_path: string; created_at: string }
interface ReportRow { id: number; reporter_name: string; reported_id: string; reported_name: string; reason: string; created_at: string }

export function AdminScreen() {
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reasons, setReasons] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("pending_verifications");
    if (error) { toast(errorText(error)); return; }
    const list = (data ?? []) as Pending[];
    setPending(list);
    const paths = list.flatMap((p) => [p.id_path, p.selfie_path]);
    if (paths.length) {
      // Short-lived links: the photos are never public.
      const { data: signed } = await supabase.storage.from("id-documents").createSignedUrls(paths, 300);
      setUrls(Object.fromEntries((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path!, s.signedUrl])));
    }
    const { data: r } = await supabase.rpc("recent_reports");
    setReports((r ?? []) as ReportRow[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(p: Pending, approve: boolean) {
    const { error } = await supabase.rpc("review_verification", { p_request: p.id, p_approve: approve, p_reason: approve ? null : (reasons[p.id] || null) });
    if (error) { toast(errorText(error)); return; }
    const { error: rmErr } = await supabase.storage.from("id-documents").remove([p.id_path, p.selfie_path]);
    toast(rmErr ? "ההחלטה נשמרה, אבל מחיקת התמונות נכשלה. מחקו אותן ידנית ב-Storage" : approve ? `${p.display_name} אומת/ה. התמונות נמחקו` : "הבקשה נדחתה. התמונות נמחקו");
    load();
  }

  return (
    <div className="list">
      <section className="item">
        <h3>בקשות אימות ({pending?.length ?? "…"})</h3>
        {pending?.length === 0 && <p className="sub">אין בקשות שמחכות לבדיקה.</p>}
        {pending?.map((p) => (
          <div key={p.id} className="verify-req">
            <div className="sub"><b>{p.display_name}</b> · {p.role === "sitter" ? "בייביסיטר" : "הורה"} · {fmtTime(p.created_at)}</div>
            <div className="verify-photos">
              {[p.id_path, p.selfie_path].map((path, i) => urls[path]
                ? <a key={path} href={urls[path]} target="_blank" rel="noreferrer"><img src={urls[path]} alt={i ? "סלפי" : "תעודת זהות"} /></a>
                : <div key={path} className="ph">{i ? "סלפי" : "ת״ז"}</div>)}
            </div>
            <p className="small">בדקו שהתמונה בתעודה מתאימה לסלפי ושהתעודה נראית אמיתית.</p>
            <input id={`reason-${p.id}`} placeholder="סיבת דחייה (תוצג למשתמש)" value={reasons[p.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [p.id]: e.target.value })} />
            <div className="row-btns">
              <button className="btn yes" type="button" onClick={() => decide(p, true)}>אישור</button>
              <button className="btn danger" type="button" onClick={() => decide(p, false)}>דחייה</button>
            </div>
          </div>
        ))}
      </section>
      <section className="item">
        <h3>דיווחים אחרונים</h3>
        {reports.length === 0 && <p className="sub">אין דיווחים.</p>}
        {reports.map((r) => (
          <div key={r.id} className="report-row">
            <div className="sub"><b>{r.reporter_name}</b> דיווח/ה על <b>{r.reported_name}</b> · {fmtTime(r.created_at)}</div>
            <p>{r.reason}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
