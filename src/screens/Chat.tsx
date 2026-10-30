import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { ConversationSummary, Message } from "../lib/types";
import { Avatar } from "../components/Avatar";
import { errorText, fmtTime, toast } from "../lib/util";
import { VerifiedBadge } from "../components/Badges";

interface Props {
  conv: ConversationSummary;
  me: string;
  onBack: () => void;
  onChanged: () => void;
  onOpenReviews?: () => void;
}

const QUICK_PARENT = ["פנוי/ה הערב?", "מה המחיר לשעה?", "יש ניסיון עם תינוקות?", "באיזה אזור את/ה?"];
const QUICK_SITTER = ["כן, אני פנוי/ה", "בני כמה הילדים?", "לאיזו שעה צריך?", "שלחו לי את הכתובת כשנסגור"];

export function ChatScreen({ conv, me, onBack, onChanged, onOpenReviews }: Props) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState(conv.blocked);
  const [safety, setSafety] = useState(false);
  const [reason, setReason] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const add = (m: Message) => setMsgs((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
    supabase.from("messages").select("*").eq("conversation_id", conv.id).order("created_at").limit(500)
      .then(({ data }) => { if (alive && data) setMsgs(data as Message[]); });
    supabase.rpc("mark_read", { p_conversation: conv.id }).then(onChanged);
    const ch = supabase
      .channel(`chat:${conv.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` }, (payload) => {
        add(payload.new as Message);
        supabase.rpc("mark_read", { p_conversation: conv.id }).then(onChanged);
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [conv.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs.length]);

  async function send(body: string) {
    body = body.trim();
    if (!body || sending) return;
    setSending(true);
    const { data, error } = await supabase.from("messages").insert({ conversation_id: conv.id, body }).select().single();
    setSending(false);
    if (error) { toast(blocked ? "אי אפשר לשלוח הודעות בשיחה חסומה" : errorText(error)); return; }
    setText("");
    setMsgs((list) => (list.some((x) => x.id === data.id) ? list : [...list, data as Message]));
    onChanged();
  }

  async function block() {
    const { error } = await supabase.from("blocks").insert({ blocker_id: me, blocked_id: conv.other_id });
    if (error && !/duplicate/i.test(error.message)) { toast(errorText(error)); return; }
    setBlocked(true); setSafety(false); toast(`${conv.other_name} נחסם/ה`); onChanged();
  }
  async function unblock() {
    const { error } = await supabase.from("blocks").delete().eq("blocker_id", me).eq("blocked_id", conv.other_id);
    if (error) { toast(errorText(error)); return; }
    setBlocked(false); toast("החסימה הוסרה"); onChanged();
  }
  async function report() {
    if (!reason.trim()) return;
    const { error } = await supabase.from("reports").insert({ reported_id: conv.other_id, reason: reason.trim() });
    if (error) { toast(errorText(error)); return; }
    setReason(""); setSafety(false); toast("הדיווח נשלח לצוות. תודה");
  }

  const quick = conv.other_role === "sitter" ? QUICK_PARENT : QUICK_SITTER;

  return (
    <div className="chat">
      <div className="chat-head">
        <button className="back" type="button" aria-label="חזרה לשיחות" onClick={onBack}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <Avatar id={conv.other_id} name={conv.other_name} />
        <div className="meta"><h3>{conv.other_name} {conv.other_verified && <VerifiedBadge small />}</h3><div className="sub">{conv.other_role === "sitter" ? "בייביסיטר" : "הורה"}</div></div>
        {onOpenReviews && <button className="btn ghost" type="button" onClick={onOpenReviews}>ביקורות</button>}
        <button className="btn ghost" type="button" aria-expanded={safety} onClick={() => setSafety(!safety)}>בטיחות</button>
      </div>
      {safety && (
        <div className="safety">
          <label className="field"><span>דיווח לצוות על התנהגות לא הולמת</span>
            <textarea id="report-reason" rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="מה קרה?" /></label>
          <div className="row-btns">
            <button className="btn" type="button" disabled={!reason.trim()} onClick={report}>שליחת דיווח</button>
            {blocked ? <button className="btn" type="button" onClick={unblock}>הסרת חסימה</button> : <button className="btn danger" type="button" onClick={block}>חסימה</button>}
          </div>
        </div>
      )}
      <div className="msgs" ref={box} aria-live="polite">
        <div className="sys">ההתכתבות נשארת באפליקציה. אל תשלחו כסף מראש ואל תשתפו פרטים אישיים לפני שנפגשתם.</div>
        {msgs.map((m) => (
          <div key={m.id} className={"msg " + (m.sender_id === me ? "from-me" : "from-them")}>
            {m.body}<time>{fmtTime(m.created_at)}</time>
          </div>
        ))}
        {blocked && <div className="sys">השיחה חסומה. אי אפשר לשלוח בה הודעות.</div>}
      </div>
      {!blocked && (
        <>
          <div className="quick">{quick.map((q) => <button key={q} type="button" onClick={() => send(q)}>{q}</button>)}</div>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <input id="msg-input" autoComplete="off" maxLength={2000} placeholder="כתבו הודעה…" aria-label="הודעה" value={text} onChange={(e) => setText(e.target.value)} />
            <button type="submit" aria-label="שליחה" disabled={sending || !text.trim()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg>
            </button>
          </form>
        </>
      )}
    </div>
  );
}
