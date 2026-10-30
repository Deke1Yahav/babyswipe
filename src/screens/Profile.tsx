import { useState } from "react";
import { supabase } from "../lib/supabase";
import type { Profile, SitterListing } from "../lib/types";
import { SitterForm } from "./SitterForm";
import { errorText, toast } from "../lib/util";
import { VerificationSection } from "../components/Verification";
import { ReviewsPanel } from "../components/Reviews";
import { VerifiedBadge } from "../components/Badges";
import { PhotoPicker } from "../components/PhotoPicker";

interface Props {
  profile: Profile;
  email: string;
  listing: SitterListing | null;
  verified: boolean;
  onChanged: () => void;
}

export function ProfileScreen({ profile, email, listing, verified, onChanged }: Props) {
  const [name, setName] = useState(profile.display_name);
  const [about, setAbout] = useState(profile.about ?? "");
  const [kids, setKids] = useState(profile.kids_text ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const availableNow = !!listing?.available_until && new Date(listing.available_until) > new Date();

  async function setAvailability(hours: number | null) {
    const until = hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null;
    const { error } = await supabase.from("sitters").update({ available_until: until }).eq("id", profile.id);
    if (error) { toast(errorText(error)); return; }
    toast(hours ? `מסומנים כפנויים ל-${hours} השעות הקרובות` : "סומנתם כלא פנויים");
    onChanged();
  }
  async function setActive(active: boolean) {
    const { error } = await supabase.from("sitters").update({ is_active: active }).eq("id", profile.id);
    if (error) { toast(errorText(error)); return; }
    toast(active ? "הפרופיל מוצג שוב להורים" : "הפרופיל הוסתר מהחיפוש");
    onChanged();
  }
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("profiles").update({ display_name: name.trim(), about: about.trim(), kids_text: kids.trim() }).eq("id", profile.id);
    if (error) toast(errorText(error)); else { toast("הפרופיל נשמר"); onChanged(); }
  }
  async function deleteAccount() {
    setBusy(true);
    const { error } = await supabase.rpc("delete_my_account");
    setBusy(false);
    if (error) { toast(errorText(error)); return; }
    await supabase.auth.signOut();
  }

  return (
    <div className="list profile">
      {listing && (
        <section className="item">
          <h3>זמינות</h3>
          <p className="sub">{availableNow
            ? `אתם מופיעים כפנויים עכשיו, עד ${new Date(listing.available_until!).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}.`
            : "סמנו שאתם פנויים כדי להופיע ראשונים להורים שמחפשים עכשיו."}</p>
          <div className="row-btns">
            <button className="btn yes" type="button" onClick={() => setAvailability(3)}>פנוי/ה ל-3 שעות</button>
            <button className="btn" type="button" onClick={() => setAvailability(8)}>ל-8 שעות</button>
            {availableNow && <button className="btn" type="button" onClick={() => setAvailability(null)}>לא פנוי/ה</button>}
          </div>
          <label className="check">
            <input id="pf-active" type="checkbox" checked={listing.is_active} onChange={(e) => setActive(e.target.checked)} />
            <span>הפרופיל מוצג להורים בחיפוש</span>
          </label>
        </section>
      )}
      <VerificationSection userId={profile.id} verified={verified} onChanged={onChanged} />
      {listing && (
        <section className="item">
          <h3>הביקורות עליי {verified && <VerifiedBadge small />}</h3>
          <ReviewsPanel sitterId={profile.id} sitterName={profile.display_name} me={profile.id} role="sitter" />
        </section>
      )}
      {listing ? (
        <section className="item">
          <h3>הפרופיל שלי</h3>
          <SitterForm userId={profile.id} name={profile.display_name} initial={listing} avatarPath={profile.avatar_path} onSaved={onChanged} />
        </section>
      ) : (
        <form className="item form" onSubmit={saveName}>
          <h3>הפרופיל שלי</h3>
          <p className="small">בייביסיטרים רואים את הפרטים האלה כשאתם שולחים להם הודעה.</p>
          <PhotoPicker userId={profile.id} name={profile.display_name} path={profile.avatar_path} onChange={onChanged}
            hint="תמונה שלכם, לא של הילדים." />
          <label className="field"><span>השם שיוצג לבייביסיטרים</span>
            <input id="pf-name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>הילדים</span>
            <input id="pf-kids" maxLength={100} value={kids} onChange={(e) => setKids(e.target.value)} placeholder="למשל: 2 ילדים, בני 3 ו-6" /></label>
          <label className="field"><span>כמה מילים עליכם</span>
            <textarea id="pf-about" rows={3} maxLength={300} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="איפה אתם גרים, מה חשוב לכם, הרגלים של הילדים" /></label>
          <button className="btn yes" type="submit" disabled={name.trim() === profile.display_name && about.trim() === (profile.about ?? "") && kids.trim() === (profile.kids_text ?? "")}>שמירה</button>
        </form>
      )}
      <section className="item">
        <h3>חשבון</h3>
        <p className="sub" dir="ltr">{email}</p>
        <div className="row-btns">
          <button className="btn" type="button" onClick={() => supabase.auth.signOut()}>התנתקות</button>
          <button className="btn danger" type="button" onClick={() => setConfirmDelete(true)}>מחיקת החשבון</button>
        </div>
        {confirmDelete && (
          <div className="confirm">
            <p>החשבון, הפרופיל וכל ההודעות יימחקו לצמיתות. אי אפשר לבטל את זה.</p>
            <div className="row-btns">
              <button className="btn danger" type="button" disabled={busy} onClick={deleteAccount}>כן, למחוק הכל</button>
              <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>ביטול</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
