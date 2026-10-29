import { useEffect, useState } from "react";

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 2600);
    };
    window.addEventListener("bs-toast", on);
    return () => { window.removeEventListener("bs-toast", on); window.clearTimeout(timer); };
  }, []);
  return <div className={"toast" + (msg ? " show" : "")} role="status" aria-live="polite">{msg}</div>;
}
