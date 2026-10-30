import { avatarUrl, colorsFor } from "../lib/util";

export function Avatar({ id, name, path, size = 46 }: { id: string; name: string; path?: string | null; size?: number }) {
  const url = avatarUrl(path);
  if (url) return <img className="avatar" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  const [a, b] = colorsFor(id);
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.48, background: `linear-gradient(150deg, ${a}, ${b})` }} aria-hidden="true">
      {name.trim()[0] ?? "?"}
    </div>
  );
}
