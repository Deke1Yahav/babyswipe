import type { NearbySitter } from "../lib/types";
import { avatarUrl, colorsFor, fmtKm } from "../lib/util";
import { RatingSummary, VerifiedBadge } from "./Badges";

export function SitterCardBody({ s }: { s: NearbySitter }) {
  const [a, b] = colorsFor(s.id);
  const photo = avatarUrl(s.avatar_path);
  return (
    <>
      <div className="art" style={{ background: `linear-gradient(150deg, ${a}, ${b})` }}>
        {photo ? <img className="photo" src={photo} alt="" draggable={false} /> : <div className="ini" aria-hidden="true">{s.display_name.trim()[0]}</div>}
        <div className={"badge" + (s.available_now ? "" : " later")}><i />{s.available_now ? "פנוי/ה עכשיו" : s.available_text || "זמינות בתיאום"}</div>
        <div className="stamp like">שמירה</div>
        <div className="stamp nope">דילוג</div>
      </div>
      <div className="info">
        <div className="name-row">
          <h2>{s.display_name}</h2>
          {s.age && <span className="age">{s.age}</span>}
          {s.verified && <VerifiedBadge />}
        </div>
        {s.occupation && <div className="occupation">{s.occupation}</div>}
        <RatingSummary avg={s.rating_avg} count={s.rating_count} />
        <div className="facts">
          <span className="fact price">₪{s.hourly_price} לשעה</span>
          <span className="fact">{fmtKm(s.distance_km)} ממך</span>
          <span className="fact">{s.years_experience} שנות ניסיון</span>
        </div>
        {s.tags.length > 0 && <div className="tags">{s.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
        {s.bio && <p className="bio">{s.bio}</p>}
        {s.available_now && s.available_text && <p className="small">{s.available_text}</p>}
      </div>
    </>
  );
}
