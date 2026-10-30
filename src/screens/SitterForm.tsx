import { useState } from "react";
import { supabase } from "../lib/supabase";
import type { Point, SitterListing } from "../lib/types";
import { MapView } from "../components/MapView";
import { PhotoPicker } from "../components/PhotoPicker";
import { TAGS, errorText, getPosition, toast } from "../lib/util";

interface Props {
  userId: string;
  name: string;
  initial: SitterListing | null;
  avatarPath: string | null;
  onSaved: () => void;
}

export function SitterForm({ userId, name: initialName, initial, avatarPath, onSaved }: Props) {
  const [photo, setPhoto] = useState(avatarPath);
  const [occupation, setOccupation] = useState(initial?.occupation ?? "");
  const [name, setName] = useState(initialName);
  const [age, setAge] = useState(initial?.age?.toString() ?? "");
  const [price, setPrice] = useState(initial?.hourly_price?.toString() ?? "50");
  const [years, setYears] = useState(initial?.years_experience?.toString() ?? "0");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [when, setWhen] = useState(initial?.available_text ?? "");
  const [loc, setLoc] = useState<Point | null>(initial ? { lat: initial.lat, lng: initial.lng } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function locate() {
    try {
      const p = await getPosition();
      setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
    } catch {
      toast("אין גישה למיקום. הקישו על המפה כדי לבחור את האזור שלכם");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!loc) { setError("בחרו את האזור שלכם על המפה או בכפתור המיקום."); return; }
    setBusy(true); setError(null);
    try {
      if (name.trim() !== initialName) {
        const { error } = await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", userId);
        if (error) throw error;
      }
      const row = {
        age: age ? Number(age) : null, hourly_price: Number(price), years_experience: Number(years),
        tags, bio: bio.trim(), available_text: when.trim(), lat: loc.lat, lng: loc.lng, occupation: occupation.trim(),
      };
      const { error } = initial
        ? await supabase.from("sitters").update(row).eq("id", userId)
        : await supabase.from("sitters").insert({ id: userId, ...row });
      if (error) throw error;
      toast("הפרופיל נשמר");
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const toggleTag = (t: string) => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : tags.length < 10 ? [...tags, t] : tags);

  return (
    <form className="form sitter-form" onSubmit={submit}>
      {!initial && <h2>הפרופיל שלכם כבייביסיטר</h2>}
      <PhotoPicker userId={userId} name={name} path={photo} onChange={setPhoto}
        hint="תמונה ברורה של הפנים שלכם. הורים בוחרים הרבה יותר בפרופילים עם תמונה." />
      <div className="grid2">
        <label className="field"><span>שם</span>
          <input id="sf-name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>גיל</span>
          <input id="sf-age" type="number" inputMode="numeric" min={16} max={99} value={age} onChange={(e) => setAge(e.target.value)} /></label>
        <label className="field"><span>מחיר לשעה (₪)</span>
          <input id="sf-price" type="number" inputMode="numeric" required min={20} max={300} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label className="field"><span>שנות ניסיון</span>
          <input id="sf-years" type="number" inputMode="numeric" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} /></label>
      </div>
      <label className="field"><span>עיסוק או לימודים</span>
        <input id="sf-occupation" maxLength={60} value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="למשל: סטודנטית לחינוך, גננת, תלמיד י״ב" /></label>
      <label className="field"><span>מתי אתם בדרך כלל זמינים</span>
        <input id="sf-when" maxLength={60} value={when} onChange={(e) => setWhen(e.target.value)} placeholder="למשל: ערבים בימים א׳–ה׳" /></label>
      <fieldset className="field">
        <legend>מה מתאים לכם</legend>
        <div className="chips">
          {TAGS.map((t) => (
            <button key={t} type="button" className={"chip" + (tags.includes(t) ? " on" : "")} aria-pressed={tags.includes(t)} onClick={() => toggleTag(t)}>{t}</button>
          ))}
        </div>
      </fieldset>
      <label className="field"><span>כמה מילים עליכם</span>
        <textarea id="sf-bio" rows={3} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="ניסיון, מה אתם אוהבים לעשות עם ילדים, הכשרות" /></label>
      <div className="field">
        <span>האזור שלכם</span>
        <p className="small">הורים רואים רק אזור משוער (בדיוק של כחצי קילומטר), לא את הכתובת שלכם.</p>
        <div className="pick-map"><MapView center={loc} onPick={setLoc} pickMarker /></div>
        <button type="button" className="secondary" onClick={locate}>שימוש במיקום הנוכחי שלי</button>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? "שומרים…" : initial ? "שמירת שינויים" : "פרסום הפרופיל"}</button>
    </form>
  );
}
