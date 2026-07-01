import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ error: "q param required" }, { status: 400 });
  }

  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us,ca`;

  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim requires a descriptive User-Agent
        "User-Agent": "Cheapotle/1.0 (github.com/akulanikhil/cheapotle)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);

    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    const r = results[0];
    return NextResponse.json({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      displayName: r.display_name,
    });
  } catch (err) {
    console.error("[/api/geocode]", err);
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}
