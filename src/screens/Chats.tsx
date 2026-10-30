import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { ConversationSummary, Role } from "../lib/types";
import { Avatar } from "../components/Avatar";
import { fmtTime } from "../lib/util";
import { VerifiedBadge } from "../components/Badges";

interface SavedSitter { sitter_id: string; name: string; price: number; avatar: string | null }

interface Props {
  role: Role;
  convs: ConversationSummary[];
  onOpen: (c: ConversationSummary) => void;
  onMessageSitter: (sitterId: string) => void;
  onUnsave: (sitterId: string) => void;
  savedVersion: number;
}

export function ChatsScreen({ role, convs, onOpen, onMessageSitter, onUnsave, savedVersion }: Props) {
  const [saved, setSaved] = useState<SavedSitter[]>([]);

  useEffect(() => {
    if (role !== "parent") return;
    supabase
      .from("swipes")
      .select("sitter_id, sitter:sitters(hourly_price, profile:profiles(display_name, avatar_path))")
      .eq("verdict", "like")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        type Row = { sitter_id: string; sitter: { hourly_price: number; profile: { display_name: string; avatar_path: string | null } | null } | null };
        setSaved(((data ?? []) as unknown as Row[])
          .filter((r) => r.sitter?.profile)
          .map((r) => ({ sitter_id: r.sitter_id, name: r.sitter!.profile!.display_name, price: r.sitter!.hourly_price, avatar: r.sitter!.profile!.avatar_path })));
      });
  }, [role, savedVersion]);

  const inConv = new Set(convs.map((c) => c.other_id));
  const waiting = saved.filter((s) => !inConv.has(s.sitter_id));

  if (!convs.length && !waiting.length) {
    return (
      <div className="list-empty">
        <h3>עוד אין שיחות</h3>
        <p>{role === "parent"
          ? "גררו כרטיס ימינה כדי לשמור בייביסיטר, ואז שלחו הודעה מכאן."
          : "כשהורה ישלח לכם הודעה, השיחה תופיע כאן. כדאי לסמן שאתם פנויים עכשיו בלשונית הפרופיל."}</p>
      </div>
    );
  }

  return (
    <div className="list">
      {convs.map((c) => (
        <button key={c.id} type="button" className="conv" onClick={() => onOpen(c)}>
          <Avatar id={c.other_id} name={c.other_name} path={c.other_avatar} />
          <div className="meta">
            <div className="conv-top"><h3>{c.other_name} {c.other_verified && <VerifiedBadge small />}</h3>{c.last_at && <time>{fmtTime(c.last_at)}</time>}</div>
            <div className={"preview" + (c.unread ? " new" : "")}>
              <span>{c.blocked ? "השיחה חסומה" : c.last_body ? (c.last_from_me ? "אתם: " : "") + c.last_body : "עוד לא נשלחו הודעות"}</span>
              {c.unread > 0 && <b className="count">{c.unread}</b>}
            </div>
          </div>
        </button>
      ))}
      {waiting.length > 0 && <h4 className="section">שמורים, עוד בלי שיחה</h4>}
      {waiting.map((s) => (
        <div key={s.sitter_id} className="item">
          <div className="top-row">
            <Avatar id={s.sitter_id} name={s.name} path={s.avatar} />
            <div className="meta"><h3>{s.name}</h3><div className="sub">₪{s.price} לשעה</div></div>
          </div>
          <div className="row-btns">
            <button className="btn yes" type="button" onClick={() => onMessageSitter(s.sitter_id)}>שליחת הודעה</button>
            <button className="btn" type="button" onClick={() => { onUnsave(s.sitter_id); setSaved(saved.filter((x) => x.sitter_id !== s.sitter_id)); }}>הסרה</button>
          </div>
        </div>
      ))}
    </div>
  );
}
