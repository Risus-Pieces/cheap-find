export type ChainId =
  | "chipotle"
  | "tacobell"
  | "wendys"
  | "dominos"
  | "marcos"
  | "chilis"
  | "whataburger"
  | "popeyes"
  | "wingstop"
  | "papajohns"
  | "panera";

export interface Store {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface PriceResult {
  price: number;
  deliveryPrice?: number;
  isLive: boolean; // false => estimated fallback
  // Set by headless-scraped chains: epoch ms when this price was scraped.
  // Presence => show a "cached" badge rather than "live" or "estimated".
  cachedAt?: number;
}

export interface ChainMeta {
  id: ChainId;
  name: string;
  benchmarkItem: string;
  accentColor: string; // hex, for markers/badges
  fallbackPrice: number; // national average, used when live price unavailable
}

export interface ChainProvider extends ChainMeta {
  findStores(lat: number, lng: number): Promise<Store[]>;
  getPrice(storeId: string): Promise<PriceResult>;
}
