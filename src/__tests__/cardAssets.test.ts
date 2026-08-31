import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CARD_IMAGE_PLACEHOLDER,
  fallbackCardAssets,
  resetCardAssetManifestForTests,
  resolveCardAssets,
} from "../lib/cardAssets";

const manifest = {
  schemaVersion: 1,
  catalogVersion: "20260829",
  assetVersion: "a".repeat(64),
  basePath: "/card-assets",
  cdnBaseUrl: "",
  cards: {
    "SP01-001-MR": {
      cardId: "SP01-001-MR",
      contentHash: "b".repeat(64),
      variants: {
        thumbWebp: "objects/bb/hash/thumb-240.webp",
        boardWebp: "objects/bb/hash/board-480.webp",
        detailWebp: "objects/bb/hash/detail-960.webp",
      },
    },
  },
};

describe("card asset resolver", () => {
  beforeEach(() => {
    resetCardAssetManifestForTests();
    vi.restoreAllMocks();
  });

  it("uses the legacy image immediately before the manifest is available", () => {
    expect(fallbackCardAssets("/cards/SP01-001-MR.png")).toEqual([
      { kind: "legacy", url: "/cards/SP01-001-MR.png" },
      { kind: "placeholder", url: CARD_IMAGE_PLACEHOLDER },
    ]);
  });

  it("selects detail, board and thumb objects before the legacy image", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => manifest,
    })));

    const resolved = await resolveCardAssets(
      "SP01-001-MR",
      "/cards/SP01-001-MR.png",
      "detail",
    );
    expect(resolved.map((item) => item.kind)).toEqual([
      "same-origin",
      "same-origin",
      "same-origin",
      "legacy",
      "placeholder",
    ]);
    expect(resolved.slice(0, 3).map((item) => item.url)).toEqual([
      "/card-assets/objects/bb/hash/detail-960.webp",
      "/card-assets/objects/bb/hash/board-480.webp",
      "/card-assets/objects/bb/hash/thumb-240.webp",
    ]);
  });

  it("falls back safely when the manifest cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    await expect(
      resolveCardAssets("UNKNOWN", "/cards/UNKNOWN.png", "thumb"),
    ).resolves.toEqual([
      { kind: "legacy", url: "/cards/UNKNOWN.png" },
      { kind: "placeholder", url: CARD_IMAGE_PLACEHOLDER },
    ]);
  });
});
