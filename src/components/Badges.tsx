export function VerifiedBadge({ small }: { small?: boolean }) {
  return (
    <span className={"verified" + (small ? " small" : "")} title="תעודת זהות אומתה">
      <svg width={small ? 12 : 14} height={small ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      מאומת/ת
    </span>
  );
}

export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${value} מתוך 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6L2.5 9.3l6.6-.8z" fill={i <= Math.round(value) ? "var(--sun)" : "var(--line)"} />
        </svg>
      ))}
    </span>
  );
}

export function RatingSummary({ avg, count }: { avg: number | null; count: number }) {
  if (!count || avg == null) return <span className="rating new">חדש/ה, אין עדיין ביקורות</span>;
  return <span className="rating"><Stars value={Number(avg)} size={14} /> <b>{Number(avg).toFixed(1)}</b> <small>({count})</small></span>;
}
