import { useEffect, useRef, useState } from "react";
import type { NearbySitter, Verdict } from "../lib/types";
import { SitterCardBody } from "../components/SitterCard";

interface Props {
  deck: NearbySitter[];
  loading: boolean;
  hasLocation: boolean;
  canUndo: boolean;
  onDecide: (id: string, v: Verdict) => void;
  onUndo: () => void;
  onLocate: () => void;
  onOpenMap: (id?: string) => void;
  onResetPasses: () => void;
  onOpenDetails: (id: string) => void;
  hasPasses: boolean;
}

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function SwipeScreen(p: Props) {
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const [leaving, setLeaving] = useState<1 | -1 | 0>(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const top = p.deck[0];

  function fling(dir: 1 | -1) {
    if (!top || leaving) return;
    setLeaving(dir);
    window.setTimeout(() => {
      p.onDecide(top.id, dir > 0 ? "like" : "pass");
      setLeaving(0);
      setDrag({ dx: 0, dy: 0 });
    }, reduceMotion() ? 0 : 280);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,select,textarea")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); fling(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); fling(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!p.hasLocation) {
    return (
      <div className="empty">
        <h3>איפה אתם?</h3>
        <p>כדי להציג בייביסיטרים קרובים צריך את המיקום שלכם.</p>
        <button className="primary" type="button" onClick={p.onLocate}>שימוש במיקום שלי</button>
        <button className="link" type="button" onClick={() => p.onOpenMap()}>או בחירת מיקום על המפה</button>
      </div>
    );
  }

  const style = (i: number): React.CSSProperties => {
    if (i > 0) return { transform: `scale(${1 - i * 0.05}) translateY(${i * 14}px)` };
    if (leaving) return { transform: `translate(${leaving * (window.innerWidth + 200)}px, ${drag.dy}px) rotate(${leaving * 28}deg)`, transition: "transform .28s ease-in" };
    return { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 18}deg)`, transition: start.current ? "none" : "transform .25s" };
  };
  const likeOpacity = leaving === 1 ? 1 : Math.max(0, Math.min(1, drag.dx / 90));
  const nopeOpacity = leaving === -1 ? 1 : Math.max(0, Math.min(1, -drag.dx / 90));

  return (
    <div className="swipe">
      <div className="deck">
        {p.deck.length === 0 && (
          <div className="empty">
            <h3>{p.loading ? "מחפשים בייביסיטרים…" : "אין עוד בייביסיטרים בטווח"}</h3>
            {!p.loading && <p>נסו להרחיב את המרחק או המחיר בסינון, או לחפש על המפה.</p>}
            {!p.loading && p.hasPasses && <button className="primary" type="button" onClick={p.onResetPasses}>להציג שוב את מי שדילגתם</button>}
          </div>
        )}
        {p.deck.slice(0, 3).map((s, i) => ({ s, i })).reverse().map(({ s, i }) => (
          <article
            key={s.id}
            ref={i === 0 ? cardRef : undefined}
            className={"card" + (i === 0 ? " top" : "")}
            style={i === 0 ? ({ ...style(0), "--like": likeOpacity, "--nope": nopeOpacity } as React.CSSProperties) : style(i)}
            aria-label={`${s.display_name}, ₪${s.hourly_price} לשעה`}
            onPointerDown={i === 0 ? (e) => { if (leaving) return; start.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); } : undefined}
            onPointerMove={i === 0 ? (e) => { if (start.current) setDrag({ dx: e.clientX - start.current.x, dy: (e.clientY - start.current.y) * 0.4 }); } : undefined}
            onPointerUp={i === 0 ? () => {
              if (!start.current) return;
              start.current = null;
              const limit = Math.min(110, (cardRef.current?.offsetWidth ?? 300) * 0.28);
              if (Math.abs(drag.dx) > limit) fling(drag.dx > 0 ? 1 : -1);
              else {
                // A tap (no real drag) opens the full profile with reviews.
                if (Math.abs(drag.dx) < 6 && Math.abs(drag.dy) < 6) p.onOpenDetails(s.id);
                setDrag({ dx: 0, dy: 0 });
              }
            } : undefined}
            onPointerCancel={i === 0 ? () => { start.current = null; setDrag({ dx: 0, dy: 0 }); } : undefined}
          >
            <SitterCardBody s={s} />
          </article>
        ))}
      </div>
      <div className="actions">
        <button className="act small" type="button" aria-label="ביטול הפעולה האחרונה" disabled={!p.canUndo} onClick={p.onUndo}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M9 14l-5-5 5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
        </button>
        <button className="act big no" type="button" aria-label="דילוג" disabled={!top} onClick={() => fling(-1)}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <button className="act big yes" type="button" aria-label="שמירה" disabled={!top} onClick={() => fling(1)}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-8-5.1-8-11a4.6 4.6 0 0 1 8-3.1A4.6 4.6 0 0 1 20 10c0 5.9-8 11-8 11z" /></svg>
        </button>
        <button className="act small" type="button" aria-label="הצגה על המפה" onClick={() => p.onOpenMap(top?.id)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></svg>
        </button>
      </div>
      <div className="hint">גררו ימינה לשמירה, שמאלה לדילוג · הקישו על הכרטיס לביקורות</div>
    </div>
  );
}
