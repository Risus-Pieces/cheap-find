import type { ChainId, ChainProvider } from "./types";
import { chipotle } from "./chipotle";
import { tacobell } from "./tacobell";
import { wendys } from "./wendys";
import { dominos } from "./dominos";
import { marcos } from "./marcos";
import { chilis } from "./chilis";
import { whataburger } from "./whataburger";
import { popeyes } from "./popeyes";
import { wingstop } from "./wingstop";
import { papajohns } from "./papajohns";
import { panera } from "./panera";
// Subway is implemented (lib/chains/subway.ts) but unregistered: Akamai's HTTP/2
// fingerprinting blocks it through hosted browsers (works only with a local stealth
// browser or a paid residential-proxy add-on). Re-add `subway` below to re-enable.

// Partial: not every ChainId must be registered (e.g. subway is implemented but
// intentionally left out until it has a hosted browser that beats Akamai's HTTP/2 wall).
const providers: Partial<Record<ChainId, ChainProvider>> = {
  chipotle,
  tacobell,
  wendys,
  dominos,
  marcos,
  chilis,
  whataburger,
  popeyes,
  wingstop,
  papajohns,
  panera,
};

export function getChain(id: string): ChainProvider | undefined {
  return providers[id as ChainId];
}

export function listChains(): ChainProvider[] {
  return Object.values(providers);
}
