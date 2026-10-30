import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Review, Role } from "../lib/types";
import { errorText, fmtTime, toast } from "../lib/util";
import { Stars, VerifiedBadge } from "./Badges";

interface Props {
  sitterId: string;
  sitterName: string;
  me: string;
  role: Role;
  isAdmin?: boolean;
}

export function ReviewsPanel({ sitterId, sitterName, me, role, isAdmin }: Props) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const isSitterSelf = me === sitterId;

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("sitter_reviews", { p_sitter: sitterId });
    if (error) { toast(errorText(error)); return; }
    const list = (data ?? []) as Review[];
    setReviews(list);
    const mine = list.find((r) => r.mine);
    if (mine) { setRating(mine.rating); setBody(mine.body); }
    if (role === "parent") {
      const { data: ok } = await supabase.rpc("can_review", { p_sitter: sitterId });
      setCanWrite(Boolean(ok));
    }
  }, [sitterId, role]);
  useEffect(() => { load(); }, [load]);

  const mine = reviews?.find((r) => r.mine);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) { toast("בחרו דירוג של 1 עד 5 כוכבים"); return; }
    const { error } = mine
      ? await supabase.from("reviews").update({ rating, body: body.trim() }).eq("id", mine.id)
      : await supabase.from("reviews").insert({ sitter_id: sitterId, rating, body: body.trim() });
    if (error) { toast(errorText(error)); return; }
    toast(mine ? "הביקורת עודכנה" : "תודה! הביקורת פורסמה");
    setEditing(false);
    load();
  }
  async function remove(id: number) {
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) { toast(errorText(error)); return; }
    toast("הביקורת נמחקה");
    if (mine?.id === id) { setRating(0); setBody(""); }
    load();
  }
  async function sendReply(id: number) {
    const { error } = await supabase.rpc("reply_to_review", { p_review: id, p_body: reply });
    if (error) { toast(errorText(error)); return; }
    setReplyFor(null); setReply(""); load();
  }

  const showForm = role === "parent" && canWrite && (!mine || editing);

  return (
    <div className="reviews">
      {role === "parent" && !isSitterSelf && (
        showForm ? (
          <form className="review-form" onSubmit={save}>
            <b>{mine ? "עריכת הביקורת שלך" : `איך היה עם ${sitterName}?`}</b>
            <div className="star-pick" role="radiogroup" aria-label="דירוג">
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} כוכבים`} onClick={() => setRating(i)}>
                  <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6L2.5 9.3l6.6-.8z" fill={i <= rating ? "var(--sun)" : "var(--line)"} /></svg>
                </button>
              ))}
            </div>
            <textarea id={`review-body-${sitterId}`} rows={3} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="מה היה טוב? מה כדאי שהורים אחרים ידעו?" />
            <div className="row-btns">
              <button className="btn yes" type="submit">{mine ? "שמירה" : "פרסום ביקורת"}</button>
              {editing && <button className="btn" type="button" onClick={() => setEditing(false)}>ביטול</button>}
            </div>
          </form>
        ) : !mine && reviews && (
          <p className="small">אפשר לכתוב ביקורת אחרי שהתכתבתם עם {sitterName} ושניכם שלחתם הודעות.</p>
        )
      )}
      {reviews === null && <p className="small">טוען ביקורות…</p>}
      {reviews?.length === 0 && <p className="small">אין עדיין ביקורות.</p>}
      {reviews?.map((r) => (
        <article key={r.id} className="review">
          <div className="review-top">
            <b>{r.parent_name}</b>{r.parent_verified && <VerifiedBadge small />}
            <Stars value={r.rating} size={13} />
            <time>{fmtTime(r.created_at)}</time>
          </div>
          {r.body && <p>{r.body}</p>}
          {r.sitter_reply && <p className="reply"><b>תגובת {sitterName}:</b> {r.sitter_reply}</p>}
          <div className="review-actions">
            {r.mine && !editing && <button className="link" type="button" onClick={() => setEditing(true)}>עריכה</button>}
            {(r.mine || isAdmin) && <button className="link" type="button" onClick={() => remove(r.id)}>{r.mine ? "מחיקה" : "מחיקה (ניהול)"}</button>}
            {isSitterSelf && replyFor !== r.id && <button className="link" type="button" onClick={() => { setReplyFor(r.id); setReply(r.sitter_reply ?? ""); }}>{r.sitter_reply ? "עריכת תגובה" : "תגובה"}</button>}
          </div>
          {isSitterSelf && replyFor === r.id && (
            <div className="reply-form">
              <textarea id={`reply-${r.id}`} rows={2} maxLength={500} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="תגובה פומבית לביקורת" />
              <div className="row-btns">
                <button className="btn yes" type="button" onClick={() => sendReply(r.id)}>שמירת תגובה</button>
                <button className="btn" type="button" onClick={() => setReplyFor(null)}>ביטול</button>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
