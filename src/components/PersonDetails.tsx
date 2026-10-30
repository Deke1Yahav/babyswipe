import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { avatarUrl, errorText, toast } from "../lib/util";
import { Avatar } from "./Avatar";
import { VerifiedBadge } from "./Badges";

export function AdminPhotoRemove({ userId, path, onRemoved }: { userId: string; path: string; onRemoved: () => void }) {
  async function remove() {
    const { error } = await supabase.rpc("admin_clear_avatar", { p_user: userId });
    if (error) { toast(errorText(error)); return; }
    await supabase.storage.from("avatars").remove([path]);
    toast("התמונה הוסרה");
    onRemoved();
  }
  return <button className="btn danger" type="button" onClick={remove}>הסרת התמונה (ניהול)</button>;
}

interface Parent { display_name: string; about: string; kids_text: string; avatar_path: string | null; verified_at: string | null }

// A parent's profile, as a sitter sees it from a conversation.
export function ParentDetails({ id, name, isAdmin, onClose }: { id: string; name: string; isAdmin: boolean; onClose: () => void }) {
  const [p, setP] = useState<Parent | null>(null);
  useEffect(() => {
    supabase.from("profiles").select("display_name, about, kids_text, avatar_path, verified_at").eq("id", id).maybeSingle()
      .then(({ data }) => setP((data as Parent) ?? null));
  }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const photo = avatarUrl(p?.avatar_path);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`הפרופיל של ${name}`}>
      <div className="overlay-head">
        <button className="back" type="button" aria-label="סגירה" onClick={onClose}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <Avatar id={id} name={name} path={p?.avatar_path} size={52} />
        <div className="meta"><h3>{name} {p?.verified_at && <VerifiedBadge small />}</h3><div className="sub">הורה</div></div>
      </div>
      <div className="overlay-body">
        {photo && <img className="hero-photo" src={photo} alt={`התמונה של ${name}`} />}
        {isAdmin && p?.avatar_path && <AdminPhotoRemove userId={id} path={p.avatar_path} onRemoved={() => setP({ ...p, avatar_path: null })} />}
        {p?.kids_text && <div className="facts"><span className="fact">{p.kids_text}</span></div>}
        {p?.about && <p className="full-bio">{p.about}</p>}
        {p && !p.kids_text && !p.about && <p className="small">ההורה עוד לא הוסיף/ה פרטים.</p>}
      </div>
    </div>
  );
}
