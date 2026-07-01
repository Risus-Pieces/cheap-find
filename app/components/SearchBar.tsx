"use client";

import { useState, useRef, useEffect } from "react";

interface SearchBarProps {
  onSearch: (lat: number, lng: number, label: string) => void;
  disabled?: boolean;
}

export default function SearchBar({ onSearch, disabled }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear error when user starts typing
  useEffect(() => {
    if (error) setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (res.status === 404) {
        setError("Location not found. Try a city, address, or ZIP code.");
        return;
      }
      if (!res.ok) throw new Error();
      const { lat, lng, displayName } = await res.json();
      onSearch(lat, lng, displayName);
      setQuery("");
    } catch {
      setError("Couldn't geocode that location. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") {
      setQuery("");
      inputRef.current?.blur();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex items-center gap-2.5 bg-gray-50 rounded-xl px-4 py-3 border-2 transition-all ${
          error
            ? "border-red-300 bg-white"
            : "border-gray-200 focus-within:border-[#2563eb] focus-within:bg-white focus-within:shadow-sm"
        }`}
      >
        {/* Search icon */}
        <svg
          className="h-4 w-4 text-gray-400 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
          />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search city, address, or ZIP code…"
          disabled={disabled || loading}
          className="flex-1 text-sm font-medium text-gray-800 placeholder-gray-400 bg-transparent outline-none min-w-0 disabled:opacity-50"
        />

        {/* Clear button */}
        {query && !loading && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            aria-label="Clear"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Loading spinner */}
        {loading && (
          <svg className="animate-spin h-4 w-4 text-[#2563eb] shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}

        {/* Search button */}
        {!loading && (
          <button
            onClick={handleSearch}
            disabled={!query.trim() || disabled}
            className="shrink-0 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold px-4 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors uppercase tracking-wide"
          >
            Search
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs font-medium text-red-600 pl-1">{error}</p>
      )}
    </div>
  );
}
