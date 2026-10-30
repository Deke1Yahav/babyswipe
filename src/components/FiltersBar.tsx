import { useState } from "react";
import type { Filters } from "../lib/types";

export function FiltersBar({ filters, onChange, count }: { filters: Filters; onChange: (f: Filters) => void; count: number }) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  return (
    <div className={"filters" + (open ? " open" : "")}>
      <button className="filters-sum" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        <span className="sum"><b>{count}</b> בטווח · עד {filters.maxKm} ק״מ · עד ₪{filters.maxPrice}{filters.nowOnly ? " · פנויים עכשיו" : ""}{filters.verifiedOnly ? " · מאומתים" : ""}</span>
        <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="filters-body">
          <label className="f-row" htmlFor="f-dist">
            <span>מרחק מקסימלי <output>עד {filters.maxKm} ק״מ</output></span>
            <input id="f-dist" type="range" min={0.5} max={30} step={0.5} value={filters.maxKm} onChange={(e) => set({ maxKm: Number(e.target.value) })} />
          </label>
          <label className="f-row" htmlFor="f-price">
            <span>מחיר מקסימלי לשעה <output>עד ₪{filters.maxPrice}</output></span>
            <input id="f-price" type="range" min={30} max={200} step={5} value={filters.maxPrice} onChange={(e) => set({ maxPrice: Number(e.target.value) })} />
          </label>
          <div className="f-inline">
            <label className="check"><input id="f-now" type="checkbox" checked={filters.nowOnly} onChange={(e) => set({ nowOnly: e.target.checked })} /> <span>פנויים עכשיו בלבד</span></label>
            <label className="check"><input id="f-verified" type="checkbox" checked={!!filters.verifiedOnly} onChange={(e) => set({ verifiedOnly: e.target.checked })} /> <span>מאומתים בלבד</span></label>
            <select id="f-sort" aria-label="מיון" value={filters.sort} onChange={(e) => set({ sort: e.target.value as Filters["sort"] })}>
              <option value="dist">הקרובים קודם</option>
              <option value="price">הזולים קודם</option>
              <option value="rating">הדירוג הגבוה קודם</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
