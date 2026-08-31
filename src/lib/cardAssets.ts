export type CardImageIntent = "thumb" | "board" | "detail";

interface CardAssetVariants {
  thumbWebp?: string;
  boardWebp?: string;
  detailWebp?: string;
}

interface CardAssetEntry {
  cardId: string;
  contentHash: string;
  legacyUrl?: string;
  variants: CardAssetVariants;
}

interface CardAssetManifest {
  schemaVersion: 1;
  assetVersion: string;
  basePath: string;
  cdnBaseUrl?: string;
  cards: Record<string, CardAssetEntry>;
}

export interface CardAssetCandidate {
  kind: "cdn" | "same-origin" | "legacy" | "placeholder";
  url: string;
}

const MANIFEST_PATH = "/card-assets/card-assets.manifest.json";
const RETRY_COOLDOWN_MS = 15_000;

export const CARD_IMAGE_PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 335">
    <rect width="240" height="335" fill="#1c1917"/>
    <rect x="7" y="7" width="226" height="321" rx="8" fill="none" stroke="#78716c" stroke-width="2"/>
    <text x="120" y="157" fill="#fca5a5" font-family="sans-serif" font-size="22" text-anchor="middle">HERO RUSH</text>
    <text x="120" y="184" fill="#a8a29e" font-family="sans-serif" font-size="12" text-anchor="middle">CARD IMAGE</text>
  </svg>
`)}`;

let manifestValue: CardAssetManifest | null = null;
let manifestPromise: Promise<CardAssetManifest | null> | null = null;
let retryAfter = 0;

function manifestUrl(): string {
  return import.meta.env.VITE_CARD_ASSET_MANIFEST || MANIFEST_PATH;
}

function configuredCdnBase(): string {
  return (import.meta.env.VITE_CARD_ASSET_CDN || "").replace(/\/$/, "");
}

function validManifest(value: unknown): value is CardAssetManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CardAssetManifest>;
  return candidate.schemaVersion === 1
    && typeof candidate.assetVersion === "string"
    && typeof candidate.basePath === "string"
    && !!candidate.cards
    && typeof candidate.cards === "object";
}

export async function loadCardAssetManifest(): Promise<CardAssetManifest | null> {
  if (manifestValue) return manifestValue;
  if (manifestPromise) return manifestPromise;
  if (Date.now() < retryAfter) return null;

  manifestPromise = fetch(manifestUrl(), { cache: "no-cache", credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`card asset manifest returned ${response.status}`);
      const value: unknown = await response.json();
      if (!validManifest(value)) throw new Error("invalid card asset manifest");
      manifestValue = value;
      return value;
    })
    .catch(() => {
      retryAfter = Date.now() + RETRY_COOLDOWN_MS;
      return null;
    })
    .finally(() => {
      manifestPromise = null;
    });
  return manifestPromise;
}

export function primeCardAssetManifest(): void {
  void loadCardAssetManifest();
}

function joinUrl(base: string, relative: string): string {
  const normalizedBase = base.replace(/\/$/, "");
  const normalizedPath = relative.replace(/^\//, "");
  if (/^https?:\/\//i.test(normalizedBase)) return `${normalizedBase}/${normalizedPath}`;
  return `/${normalizedBase.replace(/^\//, "")}/${normalizedPath}`.replace(/\/{2,}/g, "/");
}

function variantOrder(variants: CardAssetVariants, intent: CardImageIntent): string[] {
  if (intent === "thumb") return [variants.thumbWebp, variants.boardWebp, variants.detailWebp].filter(Boolean) as string[];
  if (intent === "board") return [variants.boardWebp, variants.thumbWebp, variants.detailWebp].filter(Boolean) as string[];
  return [variants.detailWebp, variants.boardWebp, variants.thumbWebp].filter(Boolean) as string[];
}

function unique(candidates: CardAssetCandidate[]): CardAssetCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!candidate.url || seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

export function fallbackCardAssets(legacyUrl?: string): CardAssetCandidate[] {
  return unique([
    ...(legacyUrl ? [{ kind: "legacy" as const, url: legacyUrl }] : []),
    { kind: "placeholder", url: CARD_IMAGE_PLACEHOLDER },
  ]);
}

export async function resolveCardAssets(
  cardId: string,
  legacyUrl: string | undefined,
  intent: CardImageIntent,
): Promise<CardAssetCandidate[]> {
  const manifest = await loadCardAssetManifest();
  const entry = manifest?.cards[cardId];
  if (!manifest || !entry) return fallbackCardAssets(legacyUrl);

  const relativePaths = variantOrder(entry.variants, intent);
  const cdnBase = configuredCdnBase() || (manifest.cdnBaseUrl || "").replace(/\/$/, "");
  const sameOrigin = manifest.basePath || "/card-assets";
  return unique([
    ...relativePaths.flatMap((relative) => [
      ...(cdnBase ? [{ kind: "cdn" as const, url: joinUrl(cdnBase, relative) }] : []),
      { kind: "same-origin" as const, url: joinUrl(sameOrigin, relative) },
    ]),
    ...(legacyUrl ? [{ kind: "legacy" as const, url: legacyUrl }] : []),
    { kind: "placeholder", url: CARD_IMAGE_PLACEHOLDER },
  ]);
}

export function resetCardAssetManifestForTests(): void {
  manifestValue = null;
  manifestPromise = null;
  retryAfter = 0;
}
