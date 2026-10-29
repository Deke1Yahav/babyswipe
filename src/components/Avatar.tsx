import { colorsFor } from "../lib/util";

export function Avatar({ id, name, size = 46 }: { id: string; name: string; size?: number }) {
  const [a, b] = colorsFor(id);
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.48, background: `linear-gradient(150deg, ${a}, ${b})` }} aria-hidden="true">
      {name.trim()[0] ?? "?"}
    </div>
  );
}
