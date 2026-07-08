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
import { subway } from "./subway";

const providers: Record<ChainId, ChainProvider> = {
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
  subway,
};

export function getChain(id: string): ChainProvider | undefined {
  return providers[id as ChainId];
}

export function listChains(): ChainProvider[] {
  return Object.values(providers);
}
