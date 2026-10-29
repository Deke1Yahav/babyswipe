import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { NearbySitter, Point } from "../lib/types";

interface Props {
  center: Point | null;
  radiusKm?: number;
  sitters?: NearbySitter[];
  selectedId?: string | null;
  likedIds?: Set<string>;
  dimmed?: (s: NearbySitter) => boolean;
  onSelect?: (id: string | null) => void;
  // When set, a tap on the map reports the tapped point.
  onPick?: (p: Point) => void;
  pickMarker?: boolean;
}

const FALLBACK: Point = { lat: 32.0853, lng: 34.7818 };

export function MapView({ center, radiusKm, sitters = [], selectedId, likedIds, dimmed, onSelect, onPick, pickMarker }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const handlers = useRef({ onSelect, onPick });
  handlers.current = { onSelect, onPick };

  useEffect(() => {
    if (!el.current) return;
    const c = center ?? FALLBACK;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([c.lat, c.lng], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (handlers.current.onPick) handlers.current.onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
      else handlers.current.onSelect?.(null);
    });
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
    // The map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit the view when the center or radius changes.
  useEffect(() => {
    const m = map.current;
    if (!m || !center) return;
    if (radiusKm) m.fitBounds(L.latLng(center.lat, center.lng).toBounds(radiusKm * 2000 * 1.1));
    else m.setView([center.lat, center.lng], Math.max(m.getZoom(), 14));
  }, [center?.lat, center?.lng, radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    if (center && radiusKm) {
      L.circle([center.lat, center.lng], { radius: radiusKm * 1000, color: "#1D9963", weight: 2, dashArray: "6 6", fillOpacity: 0.07 }).addTo(g);
    }
    if (center) {
      L.marker([center.lat, center.lng], {
        icon: L.divIcon({ className: "", html: `<div class="me-dot"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false, keyboard: false,
      }).addTo(g);
      if (pickMarker) L.circle([center.lat, center.lng], { radius: 300, color: "#2D7FF9", weight: 1, fillOpacity: 0.12 }).addTo(g);
    }
    for (const s of sitters) {
      const cls = ["pin", s.available_now ? "now" : "", likedIds?.has(s.id) ? "liked" : "", dimmed?.(s) ? "dim" : "", selectedId === s.id ? "sel" : ""].join(" ");
      // Built as a DOM node (not an HTML string) so names typed by users are never parsed as markup.
      const html = document.createElement("button");
      html.type = "button";
      html.className = cls;
      html.textContent = `${s.display_name} · ₪${s.hourly_price}`;
      const marker = L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: "pin-wrap", html, iconSize: [0, 0], iconAnchor: [0, 0] }),
        zIndexOffset: selectedId === s.id ? 1000 : 0,
      });
      marker.on("click", (e) => { L.DomEvent.stopPropagation(e); handlers.current.onSelect?.(s.id); });
      marker.addTo(g);
    }
  }, [center?.lat, center?.lng, radiusKm, sitters, selectedId, likedIds, dimmed, pickMarker]);

  return <div ref={el} className="leaflet-host" dir="ltr" />;
}
