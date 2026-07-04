"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { Store, PriceResult } from "@/lib/chains/types";
import { CHAIN_META } from "@/lib/chains/meta";
import { getStoreImage } from "@/lib/images";
import { haversineDistance } from "@/lib/haversine";
import type { StoreWithImage } from "./components/LocationCard";
import LocationCard from "./components/LocationCard";
import SearchBar from "./components/SearchBar";
import { ChainPicker } from "./components/ChainPicker";
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

  const [chain, setChain] = useState<string>("chipotle");

  const [userGPS, setUserGPS] = useState<Location | null>(null);
  const [searchCenter, setSearchCenter] = useState<Location | null>(null);

  const [stores, setStores] = useState<StoreWithImage[]>([]);
  // keyed by storeId (string)
  const [prices, setPrices] = useState<Record<string, PriceResult>>({});
  const [loadingPriceKeys, setLoadingPriceKeys] = useState<Set<string>>(new Set());

  const [sortMode, setSortMode] = useState<SortMode>("price");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showSearchAreaButton, setShowSearchAreaButton] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [minutesAgo, setMinutesAgo] = useState(0);

  const mapRef = useRef<MapHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const mapCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const mapZoomRef = useRef<number>(12);
  const searchZoomRef = useRef<number>(12);
  const mapBoundsRef = useRef<{ north: number; south: number; east: number; west: number } | null>(null);
  const hasLoadedOnce = useRef(false);
  // Bumped on every new search; stale in-flight price fetches bail when it changes
  const fetchGenerationRef = useRef(0);

  // Stable refs to avoid stale closures
  const pricesRef = useRef<Record<string, PriceResult>>({});
  useEffect(() => { pricesRef.current = prices; }, [prices]);
  const chainRef = useRef<string>("chipotle");
  useEffect(() => { chainRef.current = chain; }, [chain]);

  // Derived: current chain metadata
  const chainMeta = useMemo(
    () => CHAIN_META.find((c) => c.id === chain) ?? CHAIN_META[0],
    [chain]
  );

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
    storeId: string,
    currentChain: string,
    generation: number,
    removeIfNotLive = false
  ) => {
    const key = storeId;
    try {
      const res = await fetch(`/api/${currentChain}/price/${storeId}`);
      // Bail before any state write if a newer search superseded this fetch
      if (generation !== fetchGenerationRef.current) return;
      if (!res.ok) return;
      const data: PriceResult = await res.json();
      if (generation !== fetchGenerationRef.current) return;
      if (!data.isLive) {
        if (removeIfNotLive) {
          setStores((prev) => prev.filter((s) => s.id !== storeId));
        }
        // Still record estimated price
        setPrices((prev) => ({ ...prev, [key]: data }));
        return;
      }
      setPrices((prev) => ({ ...prev, [key]: data }));
    } finally {
      if (generation === fetchGenerationRef.current) {
        setLoadingPriceKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    }
  }, []);

  const fetchPricesProgressively = useCallback(
    async (
      storeList: StoreWithImage[],
      refLat: number,
      refLng: number,
      currentChain: string,
      generation: number,
      removeIfNotLive = false
    ) => {
      const sorted = [...storeList].sort(
        (a, b) =>
          haversineDistance(refLat, refLng, a.lat, a.lng) -
          haversineDistance(refLat, refLng, b.lat, b.lng)
      );

      // Skip already-cached
      const toFetch = sorted.filter((s) => !pricesRef.current[s.id]);

      if (generation !== fetchGenerationRef.current) return;
      setLoadingPriceKeys((prev) => {
        const next = new Set(prev);
        toFetch.forEach((s) => next.add(s.id));
        return next;
      });

      const first = toFetch.slice(0, 10);
      const rest = toFetch.slice(10);

      await Promise.allSettled(first.map((s) => fetchPrice(s.id, currentChain, generation, removeIfNotLive)));
      if (rest.length > 0 && generation === fetchGenerationRef.current) {
        await Promise.allSettled(rest.map((s) => fetchPrice(s.id, currentChain, generation, removeIfNotLive)));
      }
    },
    [fetchPrice]
  );

  // ── Store search ──────────────────────────────────────────────────────────
  const searchStores = useCallback(
    async (location: Location, currentChain: string, skipFlyTo = false) => {
      fetchGenerationRef.current += 1;
      const generation = fetchGenerationRef.current;
      setAppStatus("loading");
      setShowSearchAreaButton(false);
      setSelectedId(null);
      setPrices({});
      pricesRef.current = {};
      setLoadingPriceKeys(new Set());

      try {
        const res = await fetch(`/api/${currentChain}/stores?lat=${location.lat}&lng=${location.lng}`);
        if (generation !== fetchGenerationRef.current) return;
        if (res.status === 404) {
          setErrorMsg("No locations found in this area.");
          setAppStatus("error");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (generation !== fetchGenerationRef.current) return;
        // Attach images client-side
        const storeList: StoreWithImage[] = (data.stores as Store[]).map((s) => ({
          ...s,
          image: getStoreImage(s.id),
        }));

        setStores(storeList);
        setSearchCenter(location);
        setCachedAt(Date.now());
        setAppStatus("success");
        hasLoadedOnce.current = true;

        if (!skipFlyTo) {
          mapRef.current?.flyTo(location.lat, location.lng, 12);
          searchZoomRef.current = 12;
        } else {
          searchZoomRef.current = mapZoomRef.current;
        }

        fetchPricesProgressively(storeList, location.lat, location.lng, currentChain, generation, true);
      } catch (err) {
        console.error(err);
        if (generation !== fetchGenerationRef.current) return;
        setErrorMsg("Failed to fetch locations. Please try again.");
        setAppStatus("error");
      }
    },
    [fetchPricesProgressively]
  );

  // ── Area search ───────────────────────────────────────────────────────────
  const searchArea = useCallback(async () => {
    const currentChain = chainRef.current;
    fetchGenerationRef.current += 1;
    const generation = fetchGenerationRef.current;
    setAppStatus("loading");
    setShowSearchAreaButton(false);
    setSelectedId(null);
    setPrices({});
    pricesRef.current = {};
    setLoadingPriceKeys(new Set());

    let points = mapRef.current?.getVisiblePlacePoints() ?? [];

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

    if (mapCenterRef.current) points.push(mapCenterRef.current);

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
          fetch(`/api/${currentChain}/stores?lat=${p.lat}&lng=${p.lng}`).then((r) => r.json())
        )
      );
      if (generation !== fetchGenerationRef.current) return;

      const seenIds = new Set<string>();
      const allStores: StoreWithImage[] = [];
      for (const r of results) {
        if (r.status === "fulfilled" && Array.isArray(r.value.stores)) {
          for (const s of r.value.stores as Store[]) {
            if (!seenIds.has(s.id)) {
              seenIds.add(s.id);
              allStores.push({ ...s, image: getStoreImage(s.id) });
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

      fetchPricesProgressively(allStores, centerLat, centerLng, currentChain, generation, true);
    } catch (err) {
      console.error(err);
      if (generation !== fetchGenerationRef.current) return;
      setErrorMsg("Failed to fetch locations. Please try again.");
      setAppStatus("error");
    }
  }, [fetchPricesProgressively]);

  // ── Chain switch: re-fetch if a location is active ────────────────────────
  useEffect(() => {
    if (!searchCenter) return;
    searchStores(searchCenter, chain, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);

  // ── Store click (card or marker) ──────────────────────────────────────────
  const handleStoreSelect = useCallback(
    (storeId: string) => {
      setSelectedId((prev) => (prev === storeId ? null : storeId));
      const store = stores.find((s) => s.id === storeId);
      if (store) {
        mapRef.current?.flyTo(store.lat, store.lng, 14);
      }
    },
    [stores]
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
        searchStores(loc, chainRef.current);
      },
      () => {
        setErrorMsg("Location access denied. Please allow location or search manually.");
        setAppStatus("error");
      }
    );
  }

  // ── Address search ────────────────────────────────────────────────────────
  function handleAddressSearch(lat: number, lng: number, label: string) {
    searchStores({ lat, lng, label }, chainRef.current);
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

  const sorted = useMemo(() => {
    const withPrices = storesWithDistance.filter((s) => prices[s.id]);
    const withoutPrices = storesWithDistance.filter((s) => !prices[s.id]);

    const sortedPriced = [...withPrices].sort((a, b) =>
      sortMode === "price"
        ? prices[a.id].price - prices[b.id].price
        : a.distance - b.distance
    );
    const sortedUnpriced = [...withoutPrices].sort((a, b) => a.distance - b.distance);

    return [...sortedPriced, ...sortedUnpriced];
  }, [storesWithDistance, prices, sortMode]);

  const cheapestId = useMemo(() => {
    const priced = sorted.filter((s) => prices[s.id]?.isLive);
    if (!priced.length) return null;
    return priced.reduce(
      (minId, s) =>
        prices[s.id].price < prices[minId].price ? s.id : minId,
      priced[0].id
    );
  }, [sorted, prices]);

  const isLiveData = Object.values(prices).some((p) => p.isLive);
  const isBusy = appStatus === "locating" || appStatus === "loading";
  const showMap = hasLoadedOnce.current && searchCenter !== null;
  const mapUserLat = userGPS?.lat ?? searchCenter?.lat ?? 0;
  const mapUserLng = userGPS?.lng ?? searchCenter?.lng ?? 0;

  const loadingPriceCount = loadingPriceKeys.size;

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

        {/* Chain picker */}
        <ChainPicker chains={CHAIN_META} selected={chain} onSelect={setChain} />
      </header>

      {/* ── Idle splash ──────────────────────────────────────────────────── */}
      {appStatus === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 text-center bg-white">
          <div className="flex flex-col items-center gap-6">
            <div
              className="text-7xl sm:text-8xl leading-none select-none"
              style={{ fontFamily: "var(--font-barlow-condensed)", fontWeight: 900, letterSpacing: "-0.01em" }}
            >
              <span className="text-gray-900">fast</span><span style={{ color: chainMeta.accentColor }}>find</span>
            </div>
            <div>
              <h2
                className="text-4xl font-bold text-gray-800 mb-3 uppercase tracking-wide leading-tight"
                style={{ fontFamily: "var(--font-barlow-condensed)" }}
              >
                Find the Cheapest {chainMeta.benchmarkItem} Near You
              </h2>
              <p className="text-gray-500 text-sm max-w-sm mx-auto leading-relaxed font-medium">
                Real-time prices from every location nearby —<br />sorted by cost.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <button
              onClick={handleGetLocation}
              className="flex items-center justify-center gap-2 text-white font-bold py-3 px-8 rounded-full shadow-md transition-colors text-sm uppercase tracking-wider"
              style={{ backgroundColor: chainMeta.accentColor }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Use My Location
            </button>
            <span className="text-sm text-gray-400 font-medium">or search a city above</span>
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
            <span className="text-gray-900">fast</span><span style={{ color: chainMeta.accentColor }}>find</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-gray-100 border-t-[#2563eb] animate-spin" />
            <p className="text-gray-500 text-sm font-medium">
              {appStatus === "locating" ? "Getting your location…" : `Finding nearby ${chainMeta.name} locations…`}
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
            <span className="text-gray-900">fast</span><span style={{ color: chainMeta.accentColor }}>find</span>
          </div>
          <p className="text-red-600 font-semibold text-sm max-w-xs">{errorMsg}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleGetLocation}
              className="text-white text-sm font-bold px-6 py-2.5 rounded-full transition-colors uppercase tracking-wide"
              style={{ backgroundColor: chainMeta.accentColor }}
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
              prices={prices}
              cheapestId={cheapestId}
              selectedId={selectedId}
              hoveredId={hoveredId}
              accentColor={chainMeta.accentColor}
              onSelectStore={(id) => handleStoreSelect(id)}
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

          {/* Sort bar */}
          <div className="shrink-0 px-4 pt-3 pb-2 bg-white border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <p className="text-xs text-gray-500 font-medium">
                  {stores.length} {chainMeta.name} locations
                  {loadingPriceCount > 0 && (
                    <span className="text-gray-400">
                      {" · "}
                      <span className="inline-flex items-center gap-1">
                        <svg className="animate-spin h-3 w-3 text-gray-800" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Loading {loadingPriceCount} prices
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
                  price={prices[store.id]}
                  priceLoading={loadingPriceKeys.has(store.id)}
                  distance={store.distance}
                  rank={index + 1}
                  isCheapest={store.id === cheapestId}
                  isSelected={selectedId === store.id}
                  isHovered={hoveredId === store.id}
                  benchmarkItem={chainMeta.benchmarkItem}
                  onClick={() => handleStoreSelect(store.id)}
                  onHover={() => setHoveredId(store.id)}
                  onHoverEnd={() => setHoveredId(null)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
