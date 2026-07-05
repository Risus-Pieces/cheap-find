import { describe, it, expect } from "vitest";
import { getChain, listChains } from "../registry";

describe("chain registry", () => {
  it("lists all live chains", () => {
    expect(listChains().map((c) => c.id).sort()).toEqual(
      ["chilis", "chipotle", "dominos", "marcos", "popeyes", "tacobell", "wendys", "whataburger"]
    );
  });

  it("returns a provider for a valid id", () => {
    expect(getChain("wendys")?.benchmarkItem).toBe("Dave's Single");
  });

  it("returns undefined for an unknown id", () => {
    expect(getChain("subway")).toBeUndefined();
  });
});
