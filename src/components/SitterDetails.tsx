import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Role } from "../lib/types";
import { Avatar } from "./Avatar";
import { RatingSummary, VerifiedBadge } from "./Badges";
import { ReviewsPanel } from "./Reviews";
import { AdminPhotoRemove } from "./PersonDetails";
import { avatarUrl } from "../lib/util";

export interface SitterSummary {
  id: string;
  display_name: string;
  age?: number | null;
  bio?: string;
  hourly_price?: number;
  years_experience?: number;
  tags?: string[];
  available_text?: string;
  verified?: boolean;
  rating_avg?: number | null;
  rating_count?: number;
  avatar_path?: string | null;
  occupation?: string;
}

interface Props {
  sitter: SitterSummary;
  me: string;
  role: Role;
  isAdmin: boolean;
  onClose: () => void;
  onMessage?: () => void;
}

// Full-screen sheet with a sitter's details and reviews. Loads the listing itself when only id/name are known.
export function SitterDetails({ sitter: initial, me, role, isAdmin, onClose, onMessage }: Props) {
  const [s, setS] = useState<SitterSummary>(initial);
  useEffect(() => {
    if (initial.hourly_price !== undefined) return;
    supabase.from("sitters").select("age, bio, hourly_price, years_experience, tags, available_text, occupation, profile:profiles(verified_at, avatar_path)")
      .eq("id", initial.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const d = data as unknown as SitterSummary & { profile: { verified_at: string | null; avatar_path: string | null } | null };
        setS({ ...initial, ...d, verified: !!d.profile?.verified_at, avatar_path: d.profile?.avatar_path ?? null });
      });
  }, [initial]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`הפרופיל של ${s.display_name}`}>
      <div className="overlay-head">
        <button className="back" type="button" aria-label="סגירה" onClick={onClose}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <Avatar id={s.id} name={s.display_name} path={s.avatar_path} size={52} />
        <div className="meta">
          <h3>{s.display_name}{s.age ? `, ${s.age}` : ""} {s.verified && <VerifiedBadge small />}</h3>
          {s.rating_count !== undefined && <RatingSummary avg={s.rating_avg ?? null} count={s.rating_count} />}
        </div>
      </div>
      <div className="overlay-body">
        {avatarUrl(s.avatar_path) && <img className="hero-photo" src={avatarUrl(s.avatar_path)!} alt={`התמונה של ${s.display_name}`} />}
        {isAdmin && s.avatar_path && <AdminPhotoRemove userId={s.id} path={s.avatar_path} onRemoved={() => setS({ ...s, avatar_path: null })} />}
        {s.occupation && <p className="occupation">{s.occupation}</p>}
        {s.hourly_price !== undefined && (
          <div className="facts">
            <span className="fact price">₪{s.hourly_price} לשעה</span>
            {s.years_experience !== undefined && <span className="fact">{s.years_experience} שנות ניסיון</span>}
            {s.available_text && <span className="fact">{s.available_text}</span>}
          </div>
        )}
        {s.tags && s.tags.length > 0 && <div className="tags">{s.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
        {s.bio && <p className="full-bio">{s.bio}</p>}
        {onMessage && <button className="btn yes" type="button" onClick={onMessage}>שליחת הודעה</button>}
        <h4 className="section">ביקורות</h4>
        <ReviewsPanel sitterId={s.id} sitterName={s.display_name} me={me} role={role} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
