import { useMemo, useState } from "react";
import type { Filters, NearbySitter, Point } from "../lib/types";
import { MapView } from "../components/MapView";
import { Avatar } from "../components/Avatar";
import { fmtKm } from "../lib/util";

interface Props {
  loc: Point | null;
  filters: Filters;
  all: NearbySitter[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSetLocation: (p: Point) => void;
  onLike: (id: string) => void;
  onMessage: (id: string) => void;
}

export function ExploreScreen({ loc, filters, all, selectedId, onSelect, onSetLocation, onLike, onMessage }: Props) {
  const [picking, setPicking] = useState(!loc);
  const liked = useMemo(() => new Set(all.filter((s) => s.my_verdict === "like").map((s) => s.id)), [all]);
  const dimmed = useMemo(() => (s: NearbySitter) => filters.nowOnly && !s.available_now, [filters.nowOnly]);
  const sel = all.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="map-wrap">
      <MapView
        center={loc}
        radiusKm={filters.maxKm}
        sitters={all}
        selectedId={selectedId}
        likedIds={liked}
        dimmed={dimmed}
        onSelect={onSelect}
        onPick={picking ? (p) => { onSetLocation(p); setPicking(false); } : undefined}
      />
      {picking && <div className="map-note">הקישו על המפה כדי לקבוע את המיקום שלכם</div>}
      <button className={"tool set-loc" + (picking ? " on" : "")} type="button" aria-pressed={picking} aria-label="קביעת מיקום על המפה" onClick={() => setPicking(!picking)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
      </button>
      {sel && (
        <div className="sheet">
          <div className="top-row">
            <Avatar id={sel.id} name={sel.display_name} />
            <div className="meta">
              <h3>{sel.display_name}{sel.age ? `, ${sel.age}` : ""}</h3>
              <div className="sub">₪{sel.hourly_price} לשעה · {fmtKm(sel.distance_km)} · {sel.available_now ? "פנוי/ה עכשיו" : sel.available_text || "זמינות בתיאום"}</div>
            </div>
            <button className="x" type="button" aria-label="סגירה" onClick={() => onSelect(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          {sel.bio && <p className="bio">{sel.bio}</p>}
          <div className="row-btns">
            {sel.my_verdict !== "like" && <button className="btn" type="button" onClick={() => onLike(sel.id)}>שמירה</button>}
            <button className="btn yes" type="button" onClick={() => onMessage(sel.id)}>הודעה</button>
          </div>
        </div>
      )}
    </div>
  );
}
