"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { StoreLocation } from "@/app/api/stores/route";
import { PriceData } from "@/app/api/price/[storeId]/route";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export interface MapHandle {
  flyTo(lat: number, lng: number, zoom?: number): void;
  getVisiblePlacePoints(): Array<{ lat: number; lng: number }>;
  getBounds(): { north: number; south: number; east: number; west: number } | null;
}

interface MapProps {
  userLat: number;
  userLng: number;
  stores: StoreLocation[];
  prices: Record<number, PriceData>;
  cheapestId: number;
  selectedId: number | null;
  hoveredId: number | null;
  onSelectStore: (id: number) => void;
  onMoveEnd: (lat: number, lng: number, zoom: number, bounds: { north: number; south: number; east: number; west: number }) => void;
  showSearchAreaButton: boolean;
  onSearchArea: () => void;
}

const RestaurantMap = forwardRef<MapHandle, MapProps>(function RestaurantMap(
  {
    userLat,
    userLng,
    stores,
    prices,
    cheapestId,
    selectedId,
    hoveredId,
    onSelectStore,
    onMoveEnd,
    showSearchAreaButton,
    onSearchArea,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const markersRef = useRef<Record<number, maplibregl.Marker>>({});

  // Expose flyTo, getVisiblePlacePoints, getBounds via ref
  useImperativeHandle(ref, () => ({
    flyTo(lat, lng, zoom = 13) {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 900, essential: true });
    },
    getVisiblePlacePoints() {
      const map = mapRef.current;
      if (!map) return [];
      // Query city/town label layers rendered in the current viewport
      const features = map.queryRenderedFeatures(undefined, {
        layers: ["label_city", "label_city_capital", "label_town"],
      });
      const seen = new Set<string>();
      const points: Array<{ lat: number; lng: number }> = [];
      for (const f of features) {
        if (f.geometry.type !== "Point") continue;
        const [lng, lat] = f.geometry.coordinates;
        const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
        if (!seen.has(key)) {
          seen.add(key);
          points.push({ lat, lng });
        }
      }
      return points;
    },
    getBounds() {
      const map = mapRef.current;
      if (!map) return null;
      const b = map.getBounds();
      return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
    },
  }));

  // ── Init map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [userLng, userLat],
      zoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep moveend callback fresh without re-initialising the map
  const onMoveEndRef = useRef(onMoveEnd);
  useEffect(() => { onMoveEndRef.current = onMoveEnd; }, [onMoveEnd]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => {
      const { lat, lng } = map.getCenter();
      const zoom = map.getZoom();
      const b = map.getBounds();
      const bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      };
      onMoveEndRef.current(lat, lng, zoom, bounds);
    };
    map.on("moveend", handler);
    return () => { map.off("moveend", handler); };
  }, []);

  // ── User location marker ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    userMarkerRef.current?.remove();

    const el = document.createElement("div");
    el.style.cssText = `
      width:18px;height:18px;border-radius:50%;background:#3b82f6;
      border:3px solid white;box-shadow:0 0 0 3px rgba(59,130,246,.35),0 2px 8px rgba(0,0,0,.3);
    `;

    userMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([userLng, userLat])
      .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML("<strong>You are here</strong>"))
      .addTo(map);
  }, [userLat, userLng]);

  // ── Store markers ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    stores.forEach((store) => {
      const isCheapest = store.id === cheapestId;
      const isSelected = store.id === selectedId;
      const isHovered = store.id === hoveredId;
      const price = prices[store.id];

      const active = isSelected || isHovered;
      const el = document.createElement("div");
      el.style.cssText = `
        width:${active ? "38px" : "32px"};
        height:${active ? "38px" : "32px"};
        border-radius:50%;
        background:${isCheapest ? "#16a34a" : "#6b7280"};
        border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,${active ? ".45" : ".25"});
        cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        font-size:${active ? "16px" : "13px"};
        transition:all .2s ease;
        ${active ? `outline:3px solid ${isCheapest ? "#16a34a" : "#374151"};outline-offset:2px;` : ""}
      `;
      el.innerHTML = isCheapest ? "⭐" : "🌯";
      el.title = store.name;
      el.addEventListener("click", () => onSelectStore(store.id));

      const priceLabel = price
        ? `<span style="color:#16a34a;font-weight:700">$${price.price.toFixed(2)}</span>${
            isCheapest ? ' <span style="color:#b45309">⭐ Cheapest</span>' : ""
          }`
        : `<span style="color:#9ca3af">Loading…</span>`;

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([store.lng, store.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 20 }).setHTML(
            `<div style="font-family:sans-serif;padding:4px 2px;min-width:120px">
              <strong style="font-size:13px">${store.name}</strong><br/>
              <span style="font-size:12px;color:#6b7280">${store.address.split(",")[0]}</span><br/>
              <div style="margin-top:4px;font-size:13px">${priceLabel}</div>
            </div>`
          )
        )
        .addTo(map);

      markersRef.current[store.id] = marker;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, cheapestId, selectedId, hoveredId, prices]);

  // ── Fly to selected store ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedId === null) return;
    const store = stores.find((s) => s.id === selectedId);
    if (!store) return;
    map.flyTo({ center: [store.lng, store.lat], zoom: 14, duration: 900 });
  }, [selectedId, stores]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* "Search this area" floating button */}
      {showSearchAreaButton && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex justify-center">
          <button
            onClick={onSearchArea}
            className="pointer-events-auto flex items-center gap-1.5 bg-white text-gray-800 text-xs font-semibold px-4 py-2 rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 hover:shadow-xl transition-all"
          >
            <svg className="h-3.5 w-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            Search this area
          </button>
        </div>
      )}
    </div>
  );
});

export default RestaurantMap;
