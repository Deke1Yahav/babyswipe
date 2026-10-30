import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { errorText, shrinkImage, toast } from "../lib/util";
import { Avatar } from "./Avatar";

interface Props {
  userId: string;
  name: string;
  path: string | null;
  onChange: (path: string | null) => void;
  hint?: string;
}

// Uploads a profile photo to the user's folder, saves it on the profile and removes the previous file.
export function PhotoPicker({ userId, name, path, onChange, hint }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function save(next: string | null) {
    const { error } = await supabase.from("profiles").update({ avatar_path: next }).eq("id", userId);
    if (error) throw error;
    if (path) await supabase.storage.from("avatars").remove([path]);
    onChange(next);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const next = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(next, await shrinkImage(file, 800), { contentType: "image/jpeg" });
      if (error) throw error;
      await save(next);
      toast("התמונה עודכנה");
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="photo-picker">
      <Avatar id={userId} name={name || "?"} path={path} size={88} />
      <div className="photo-actions">
        <button className="btn" type="button" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "מעלים…" : path ? "החלפת תמונה" : "הוספת תמונה"}
        </button>
        {path && <button className="link" type="button" disabled={busy} onClick={() => save(null).then(() => toast("התמונה הוסרה"), (e) => toast(errorText(e)))}>הסרה</button>}
        {hint && <p className="small">{hint}</p>}
      </div>
      <input ref={input} id={`photo-${userId}`} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
