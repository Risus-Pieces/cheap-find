import type { ChainId, ChainProvider } from "./types";
import { chipotle } from "./chipotle";
import { tacobell } from "./tacobell";
import { wendys } from "./wendys";

const providers: Record<ChainId, ChainProvider> = {
  chipotle,
  tacobell,
  wendys,
};

export function getChain(id: string): ChainProvider | undefined {
  return providers[id as ChainId];
}

export function listChains(): ChainProvider[] {
  return Object.values(providers);
}
