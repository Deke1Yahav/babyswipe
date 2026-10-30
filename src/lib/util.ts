import { useEffect, useState } from "react";

export const TAGS = [
  "עזרה ראשונה", "תינוקות", "גילאי 0–3", "גילאי 3–6", "גילאי 6–12", "שיעורי בית",
  "אנגלית", "ערבית", "רוסית", "צרכים מיוחדים", "בעלי חיים", "לילות", "בישול", "ספורט",
];

const PALETTE: [string, string][] = [
  ["#FFD27A", "#F08A5D"], ["#9FD8CB", "#3C8D93"], ["#C7B8F5", "#6C5BB8"], ["#FFB5A7", "#D65A5A"],
  ["#A8D5FF", "#2F6DB5"], ["#B9E3B0", "#4E9A47"], ["#F7C6E0", "#B4457F"], ["#FFCF99", "#C46A1C"],
];

export function colorsFor(id: string): [string, string] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function fmtKm(d: number): string {
  return d < 1 ? `${Math.max(100, Math.round((d * 1000) / 100) * 100)} מ׳` : `${d.toFixed(1)} ק״מ`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
}

export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }, [key, value]);
  return [value, setValue];
}

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent("bs-toast", { detail: message }));
}

// Turns Supabase/Postgres error text into something a person can act on.
export function errorText(e: unknown): string {
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/Invalid login credentials/i.test(msg)) return "האימייל או הסיסמה שגויים.";
  if (/already registered/i.test(msg)) return "כבר קיים חשבון עם האימייל הזה. אפשר להתחבר.";
  if (/Email not confirmed/i.test(msg)) return "צריך קודם לאשר את האימייל. בדקו את תיבת הדואר.";
  if (/Password should be/i.test(msg)) return "הסיסמה צריכה להיות באורך 6 תווים לפחות.";
  if (/rate limit|too many/i.test(msg)) return "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.";
  if (/row-level security|permission denied/i.test(msg)) return "אין הרשאה לפעולה הזו.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.";
  return msg;
}

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no geolocation"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}

// Downscales a phone photo to at most 1600px JPEG before upload: faster, and keeps less personal data.
export async function shrinkImage(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("image"))), "image/jpeg", 0.85));
}
