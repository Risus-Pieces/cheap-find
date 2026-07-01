"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { StoreLocation } from "@/app/api/stores/route";
import { PriceData } from "@/app/api/price/[storeId]/route";
import { PROTEINS, type Protein } from "@/lib/proteins";
import { haversineDistance } from "@/lib/haversine";
import LocationCard from "./components/LocationCard";
import SearchBar from "./components/SearchBar";
import ProteinSelector from "./components/ProteinSelector";
import StoreDetailPanel from "./components/StoreDetailPanel";
import type { MapHandle } from "./components/Map";

const RestaurantMap = dynamic(() => import("./components/Map"), { ssr: false });

type SortMode = "price" | "distance";
type AppStatus = "idle" | "locating" | "loading" | "success" | "error";

type Location = {
  lat: number;
  lng: number;
  label: string;
};

export default function Home() {
  // ── Core state ────────────────────────────────────────────────────────────
  const [appStatus, setAppStatus] = useState<AppStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const [userGPS, setUserGPS] = useState<Location | null>(null);
  const [searchCenter, setSearchCenter] = useState<Location | null>(null);

  const [stores, setStores] = useState<StoreLocation[]>([]);
  // keyed by `${storeId}-${protein}`
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loadingPriceKeys, setLoadingPriceKeys] = useState<Set<string>>(new Set());

  const [selectedProtein, setSelectedProtein] = useState<Protein>("chicken");
  const [detailStore, setDetailStore] = useState<StoreLocation | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("price");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [showSearchAreaButton, setShowSearchAreaButton] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [minutesAgo, setMinutesAgo] = useState(0);

  const mapRef = useRef<MapHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const mapCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const mapZoomRef = useRef<number>(12);
  const searchZoomRef = useRef<number>(12);
  const mapBoundsRef = useRef<{ north: number; south: number; east: number; west: number } | null>(null);
  const hasLoadedOnce = useRef(false);

  // Stable refs to avoid stale closures
  const pricesRef = useRef<Record<string, PriceData>>({});
  useEffect(() => { pricesRef.current = prices; }, [prices]);
  const selectedProteinRef = useRef<Protein>("chicken");
  useEffect(() => { selectedProteinRef.current = selectedProtein; }, [selectedProtein]);

  // ── "Updated X min ago" ticker ────────────────────────────────────────────
  useEffect(() => {
    if (!cachedAt) return;
    const tick = () => setMinutesAgo(Math.floor((Date.now() - cachedAt) / 60_000));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [cachedAt]);

  // ── Scroll selected card into view ────────────────────────────────────────
  useEffect(() => {
    if (selectedId === null) return;
    const el = cardRefs.current.get(selectedId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  // ── Price fetching ────────────────────────────────────────────────────────
  const fetchPrice = useCallback(async (
    storeId: number,
    protein: Protein,
    removeIfNotLive = false
  ) => {
    const key = `${storeId}-${protein}`;
    try {
      const res = await fetch(`/api/price/${storeId}?protein=${protein}`);
      if (!res.ok) return;
      const data: PriceData = await res.json();
      if (!data.isLive) {
        if (removeIfNotLive) {
          setStores((prev) => prev.filter((s) => s.id !== storeId));
        }
        return;
      }
      setPrices((prev) => ({ ...prev, [key]: data }));
    } finally {
      setLoadingPriceKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const fetchPricesProgressively = useCallback(
    async (
      storeList: StoreLocation[],
      refLat: number,
      refLng: number,
      protein: Protein,
      removeIfNotLive = false
    ) => {
      const sorted = [...storeList].sort(
        (a, b) =>
          haversineDistance(refLat, refLng, a.lat, a.lng) -
          haversineDistance(refLat, refLng, b.lat, b.lng)
      );

      // Skip already-cached
      const toFetch = sorted.filter((s) => !pricesRef.current[`${s.id}-${protein}`]);

      setLoadingPriceKeys((prev) => {
        const next = new Set(prev);
        toFetch.forEach((s) => next.add(`${s.id}-${protein}`));
        return next;
      });

      const first = toFetch.slice(0, 10);
      const rest = toFetch.slice(10);

      await Promise.allSettled(first.map((s) => fetchPrice(s.id, protein, removeIfNotLive)));
      if (rest.length > 0) {
        await Promise.allSettled(rest.map((s) => fetchPrice(s.id, protein, removeIfNotLive)));
      }
    },
    [fetchPrice]
  );

  const fetchAllProteinsForStore = useCallback(async (storeId: number) => {
    const toFetch = PROTEINS.filter((p) => !pricesRef.current[`${storeId}-${p}`]);
    setLoadingPriceKeys((prev) => {
      const next = new Set(prev);
      toFetch.forEach((p) => next.add(`${storeId}-${p}`));
      return next;
    });
    await Promise.allSettled(toFetch.map((p) => fetchPrice(storeId, p)));
  }, [fetchPrice]);

  // ── Store search ──────────────────────────────────────────────────────────
  const searchStores = useCallback(
    async (location: Location, skipFlyTo = false) => {
      setAppStatus("loading");
      setShowSearchAreaButton(false);
      setSelectedId(null);
      setDetailStore(null);
      setPrices({});

      try {
        const res = await fetch(`/api/stores?lat=${location.lat}&lng=${location.lng}`);
        if (res.status === 404) {
          setErrorMsg("No locations found in this area.");
          setAppStatus("error");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const storeList: StoreLocation[] = data.stores;

        setStores(storeList);
        setSearchCenter(location);
        setCachedAt(Date.now());
        setAppStatus("success");
        hasLoadedOnce.current = true;

        if (!skipFlyTo) {
          mapRef.current?.flyTo(location.lat, location.lng, 12);
          searchZoomRef.current = 12;
        } else {
          // Stay at current zoom — record it as the new search zoom baseline
          searchZoomRef.current = mapZoomRef.current;
        }

        // Fetch prices for current protein, removing stores without online ordering
        fetchPricesProgressively(
          storeList,
          location.lat,
          location.lng,
          selectedProteinRef.current,
          true
        );
      } catch (err) {
        console.error(err);
        setErrorMsg("Failed to fetch locations. Please try again.");
        setAppStatus("error");
      }
    },
    [fetchPricesProgressively]
  );

  // ── Area search using visible map city/town labels as search anchors ──────
  const searchArea = useCallback(async () => {
    setAppStatus("loading");
    setShowSearchAreaButton(false);
    setSelectedId(null);
    setDetailStore(null);
    setPrices({});

    // Primary: query MapLibre's rendered city/town label features — these are
    // the exact coordinates of every settlement visible on screen, which puts
    // us right inside each city's Chipotle cluster (API radius ~5 mi).
    let points = mapRef.current?.getVisiblePlacePoints() ?? [];

    // Fallback: if no place labels rendered (e.g. very high zoom), use a
    // tight 5-mile grid derived from the current bounds.
    if (points.length === 0) {
      const b = mapRef.current?.getBounds() ?? mapBoundsRef.current;
      if (b) {
        const { north, south, east, west } = b;
        const midLat = (north + south) / 2;
        const latMiles = (north - south) * 69;
        const lngMiles = (east - west) * 69 * Math.cos((midLat * Math.PI) / 180);
        const SPACING = 5;
        const rows = Math.max(1, Math.min(Math.ceil(latMiles / SPACING), 8));
        const cols = Math.max(1, Math.min(Math.ceil(lngMiles / SPACING), 8));
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++)
            points.push({
              lat: south + ((north - south) / rows) * (r + 0.5),
              lng: west + ((east - west) / cols) * (c + 0.5),
            });
      }
    }

    // Always include the current map center as a backstop
    if (mapCenterRef.current) points.push(mapCenterRef.current);

    // Deduplicate by rounded coordinate
    const seen2 = new Set<string>();
    points = points.filter((p) => {
      const k = `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
      if (seen2.has(k)) return false;
      seen2.add(k);
      return true;
    });

    try {
      const results = await Promise.allSettled(
        points.map((p) =>
          fetch(`/api/stores?lat=${p.lat}&lng=${p.lng}`).then((r) => r.json())
        )
      );

      const seenIds = new Set<number>();
      const allStores: StoreLocation[] = [];
      for (const r of results) {
        if (r.status === "fulfilled" && Array.isArray(r.value.stores)) {
          for (const s of r.value.stores) {
            if (!seenIds.has(s.id)) {
              seenIds.add(s.id);
              allStores.push(s);
            }
          }
        }
      }

      if (allStores.length === 0) {
        setErrorMsg("No locations found in this area.");
        setAppStatus("error");
        return;
      }

      const b = mapRef.current?.getBounds() ?? mapBoundsRef.current;
      const centerLat = b ? (b.north + b.south) / 2 : (mapCenterRef.current?.lat ?? 0);
      const centerLng = b ? (b.east + b.west) / 2 : (mapCenterRef.current?.lng ?? 0);

      setStores(allStores);
      setSearchCenter({ lat: centerLat, lng: centerLng, label: "Map area" });
      setCachedAt(Date.now());
      setAppStatus("success");
      hasLoadedOnce.current = true;
      searchZoomRef.current = mapZoomRef.current;

      fetchPricesProgressively(
        allStores,
        centerLat,
        centerLng,
        selectedProteinRef.current,
        true
      );
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to fetch locations. Please try again.");
      setAppStatus("error");
    }
  }, [fetchPricesProgressively]);

  // ── Protein change ────────────────────────────────────────────────────────
  const handleProteinChange = useCallback(
    (protein: Protein) => {
      setSelectedProtein(protein);
      if (stores.length > 0 && searchCenter) {
        fetchPricesProgressively(stores, searchCenter.lat, searchCenter.lng, protein);
      }
    },
    [stores, searchCenter, fetchPricesProgressively]
  );

  // ── Store click (card or marker) ──────────────────────────────────────────
  const handleStoreSelect = useCallback(
    (storeId: number, storeList?: (StoreLocation & { distance: number })[]) => {
      setSelectedId((prev) => (prev === storeId ? null : storeId));
      const store = (storeList ?? []).find((s) => s.id === storeId);
      if (store) {
        setDetailStore(store);
        mapRef.current?.flyTo(store.lat, store.lng, 14);
        fetchAllProteinsForStore(storeId);
      }
    },
    [fetchAllProteinsForStore]
  );

  // ── GPS location ──────────────────────────────────────────────────────────
  function handleGetLocation() {
    if (!navigator.geolocation) {
      setErrorMsg("Geolocation is not supported by your browser.");
      setAppStatus("error");
      return;
    }
    setAppStatus("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const loc: Location = {
          lat: coords.latitude,
          lng: coords.longitude,
          label: "My Location",
        };
        setUserGPS(loc);
        searchStores(loc);
      },
      () => {
        setErrorMsg("Location access denied. Please allow location or search manually.");
        setAppStatus("error");
      }
    );
  }

  // ── Address search ────────────────────────────────────────────────────────
  function handleAddressSearch(lat: number, lng: number, label: string) {
    searchStores({ lat, lng, label });
  }

  // ── Map move / zoom detection ─────────────────────────────────────────────
  const handleMoveEnd = useCallback(
    (lat: number, lng: number, zoom: number) => {
      if (!searchCenter) return;
      const centerMoved = haversineDistance(lat, lng, searchCenter.lat, searchCenter.lng) > 0.5;
      const zoomedOut = zoom < searchZoomRef.current - 0.75;
      setShowSearchAreaButton(centerMoved || zoomedOut);
    },
    [searchCenter]
  );

  const handleMoveEndWithRef = useCallback(
    (lat: number, lng: number, zoom: number, bounds: { north: number; south: number; east: number; west: number }) => {
      mapCenterRef.current = { lat, lng };
      mapZoomRef.current = zoom;
      mapBoundsRef.current = bounds;
      handleMoveEnd(lat, lng, zoom);
    },
    [handleMoveEnd]
  );

  const handleSearchArea = useCallback(() => {
    searchArea();
  }, [searchArea]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const refLat = userGPS?.lat ?? searchCenter?.lat ?? 0;
  const refLng = userGPS?.lng ?? searchCenter?.lng ?? 0;

  const storesWithDistance = useMemo(
    () =>
      stores.map((s) => ({
        ...s,
        distance: haversineDistance(refLat, refLng, s.lat, s.lng),
      })),
    [stores, refLat, refLng]
  );

  // Prices for the currently selected protein only (passed to Map + LocationCards)
  const currentPrices = useMemo(() => {
    const result: Record<number, PriceData> = {};
    for (const store of stores) {
      const p = prices[`${store.id}-${selectedProtein}`];
      if (p) result[store.id] = p;
    }
    return result;
  }, [stores, prices, selectedProtein]);

  const sorted = useMemo(() => {
    const withPrices = storesWithDistance.filter((s) => currentPrices[s.id]);
    const withoutPrices = storesWithDistance.filter((s) => !currentPrices[s.id]);

    const sortedPriced = [...withPrices].sort((a, b) =>
      sortMode === "price"
        ? currentPrices[a.id].price - currentPrices[b.id].price
        : a.distance - b.distance
    );
    const sortedUnpriced = [...withoutPrices].sort((a, b) => a.distance - b.distance);

    return [...sortedPriced, ...sortedUnpriced];
  }, [storesWithDistance, currentPrices, sortMode]);

  const cheapestId = useMemo(() => {
    const priced = sorted.filter((s) => currentPrices[s.id]?.isLive);
    if (!priced.length) return -1;
    return priced.reduce(
      (minId, s) =>
        currentPrices[s.id].price < currentPrices[minId].price ? s.id : minId,
      priced[0].id
    );
  }, [sorted, currentPrices]);

  const isLiveData = Object.values(currentPrices).some((p) => p.isLive);
  const isBusy = appStatus === "locating" || appStatus === "loading";
  const showMap = hasLoadedOnce.current && searchCenter !== null;
  const mapUserLat = userGPS?.lat ?? searchCenter?.lat ?? 0;
  const mapUserLng = userGPS?.lng ?? searchCenter?.lng ?? 0;

  const loadingCurrentProteinCount = useMemo(
    () => [...loadingPriceKeys].filter((k) => k.endsWith(`-${selectedProtein}`)).length,
    [loadingPriceKeys, selectedProtein]
  );

  const detailStoreWithDistance = useMemo(() => {
    if (!detailStore) return null;
    const dist = haversineDistance(refLat, refLng, detailStore.lat, detailStore.lng);
    return { ...detailStore, distance: dist };
  }, [detailStore, refLat, refLng]);

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-white border-b border-gray-100 px-4 py-3 shadow-sm z-20">
        <div className="flex items-center gap-3">
          {/* Full-width search bar */}
          <div className="flex-1 min-w-0">
            <SearchBar onSearch={handleAddressSearch} disabled={isBusy} />
          </div>

          {/* Status / Near me button */}
          <div className="shrink-0">
            {appStatus === "success" ? (
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isLiveData ? "bg-green-500 animate-pulse" : "bg-yellow-400"
                  }`}
                />
                <span className="text-xs font-semibold text-gray-600 hidden sm:block">
                  {isLiveData ? "Live" : "Est."}
                </span>
              </div>
            ) : (
              <button
                onClick={handleGetLocation}
                disabled={isBusy}
                className="flex items-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-sm transition-colors disabled:opacity-60 whitespace-nowrap uppercase tracking-wide"
              >
                {isBusy ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    {appStatus === "locating" ? "Locating…" : "Loading…"}
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Near me
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Idle splash ──────────────────────────────────────────────────── */}
      {appStatus === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 text-center bg-white">
          <div className="flex flex-col items-center gap-6">
            <div
              className="text-7xl sm:text-8xl leading-none select-none"
              style={{ fontFamily: "var(--font-barlow-condensed)", fontWeight: 900, letterSpacing: "-0.01em" }}
            >
              <span className="text-gray-900">cheap</span><span className="text-[#2563eb]">otle</span>
            </div>
            <div>
              <h2
                className="text-4xl font-bold text-gray-800 mb-3 uppercase tracking-wide leading-tight"
                style={{ fontFamily: "var(--font-barlow-condensed)" }}
              >
                Find the Cheapest Bowl Near You
              </h2>
              <p className="text-gray-500 text-sm max-w-sm mx-auto leading-relaxed font-medium">
                Real-time prices from every location nearby —<br />compare all proteins, sorted by cost.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <button
              onClick={handleGetLocation}
              className="flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold py-3 px-8 rounded-full shadow-md transition-colors text-sm uppercase tracking-wider"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Use My Location
            </button>
            <span className="text-sm text-gray-400 font-medium">or search a city above ↑</span>
          </div>
          <p className="text-xs text-gray-400 max-w-xs">
            Independent price comparison tool. Not affiliated with any restaurant chain.
          </p>
        </div>
      )}

      {/* ── Initial loading ───────────────────────────────────────────────── */}
      {isBusy && !showMap && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-6 bg-white">
          <div
            className="text-5xl leading-none select-none opacity-80"
            style={{ fontFamily: "var(--font-barlow-condensed)", fontWeight: 900, letterSpacing: "-0.01em" }}
          >
            <span className="text-gray-900">cheap</span><span className="text-[#2563eb]">otle</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-gray-100 border-t-[#2563eb] animate-spin" />
            <p className="text-gray-500 text-sm font-medium">
              {appStatus === "locating" ? "Getting your location…" : "Finding nearby locations…"}
            </p>
          </div>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {appStatus === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center bg-white">
          <div
            className="text-5xl leading-none select-none opacity-70"
            style={{ fontFamily: "var(--font-barlow-condensed)", fontWeight: 900, letterSpacing: "-0.01em" }}
          >
            <span className="text-gray-900">cheap</span><span className="text-[#2563eb]">otle</span>
          </div>
          <p className="text-red-600 font-semibold text-sm max-w-xs">{errorMsg}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleGetLocation}
              className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-bold px-6 py-2.5 rounded-full transition-colors uppercase tracking-wide"
            >
              Try My Location
            </button>
            <button
              onClick={() => setAppStatus("idle")}
              className="border border-gray-300 text-gray-600 text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-gray-50 transition-colors"
            >
              Search Instead
            </button>
          </div>
        </div>
      )}

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      {showMap && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Map */}
          <div className="relative shrink-0" style={{ height: "42vh" }}>
            <RestaurantMap
              ref={mapRef}
              userLat={mapUserLat}
              userLng={mapUserLng}
              stores={stores}
              prices={currentPrices}
              cheapestId={cheapestId}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelectStore={(id) => handleStoreSelect(id, storesWithDistance)}
              onMoveEnd={(lat, lng, zoom, bounds) => handleMoveEndWithRef(lat, lng, zoom, bounds)}
              showSearchAreaButton={showSearchAreaButton}
              onSearchArea={handleSearchArea}
            />

            {/* Re-load overlay */}
            {isBusy && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                <div className="w-10 h-10 rounded-full border-4 border-gray-100 border-t-[#2563eb] animate-spin" />
              </div>
            )}
          </div>

          {/* Protein selector + sort bar */}
          <div className="shrink-0 px-4 pt-3 pb-2 bg-white border-t border-gray-100 space-y-2.5">
            <ProteinSelector selected={selectedProtein} onChange={handleProteinChange} />

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <p className="text-xs text-gray-500 font-medium">
                  {stores.length} locations
                  {loadingCurrentProteinCount > 0 && (
                    <span className="text-gray-400">
                      {" · "}
                      <span className="inline-flex items-center gap-1">
                        <svg className="animate-spin h-3 w-3 text-gray-800" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Loading {loadingCurrentProteinCount} prices
                      </span>
                    </span>
                  )}
                </p>
                {cachedAt !== null && (
                  <p className="text-xs text-gray-400">
                    {minutesAgo === 0 ? "Updated just now" : `Updated ${minutesAgo}m ago`}
                  </p>
                )}
              </div>
              <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                {(["price", "distance"] as SortMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSortMode(mode)}
                    className={`px-3 py-1 rounded-md text-xs uppercase tracking-wide transition-all ${
                      sortMode === mode
                        ? "bg-[#2563eb] text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                    style={{ fontFamily: "var(--font-barlow-condensed)", fontWeight: 700 }}
                  >
                    {mode === "price" ? "By Price" : "By Distance"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Card list */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 pb-24 space-y-3">
            {sorted.map((store, index) => (
              <div
                key={store.id}
                ref={(el) => { if (el) cardRefs.current.set(store.id, el); }}
              >
                <LocationCard
                  store={store}
                  price={currentPrices[store.id]}
                  priceLoading={loadingPriceKeys.has(`${store.id}-${selectedProtein}`)}
                  distance={store.distance}
                  rank={index + 1}
                  isCheapest={store.id === cheapestId}
                  isSelected={selectedId === store.id}
                  isHovered={hoveredId === store.id}
                  onClick={() => handleStoreSelect(store.id, storesWithDistance)}
                  onHover={() => setHoveredId(store.id)}
                  onHoverEnd={() => setHoveredId(null)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Store detail panel ─────────────────────────────────────────────── */}
      <StoreDetailPanel
        store={detailStore}
        allPrices={prices}
        loadingKeys={loadingPriceKeys}
        selectedProtein={selectedProtein}
        distance={detailStoreWithDistance?.distance ?? 0}
        onClose={() => setDetailStore(null)}
        onProteinSelect={(p) => {
          handleProteinChange(p);
          setDetailStore(null);
        }}
      />
    </div>
  );
}
