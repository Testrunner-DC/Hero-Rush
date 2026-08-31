import {
  useEffect,
  useMemo,
  useState,
  type ImgHTMLAttributes,
} from "react";
import {
  fallbackCardAssets,
  resolveCardAssets,
  type CardAssetCandidate,
  type CardImageIntent,
} from "../lib/cardAssets";

interface CardImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  cardId: string;
  legacyUrl?: string;
  intent?: CardImageIntent;
}

export default function CardImage({
  cardId,
  legacyUrl,
  intent = "thumb",
  loading,
  decoding = "async",
  onError,
  onLoad,
  ...imageProps
}: CardImageProps) {
  const immediate = useMemo(() => fallbackCardAssets(legacyUrl), [legacyUrl]);
  const [sources, setSources] = useState<CardAssetCandidate[]>(immediate);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSources(immediate);
    setSourceIndex(0);
    void resolveCardAssets(cardId, legacyUrl, intent).then((resolved) => {
      if (cancelled) return;
      setSources(resolved);
      setSourceIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, [cardId, immediate, intent, legacyUrl]);

  const active = sources[sourceIndex] || immediate[immediate.length - 1];
  return (
    <img
      {...imageProps}
      src={active.url}
      loading={loading ?? (intent === "thumb" ? "lazy" : undefined)}
      decoding={decoding}
      data-card-asset-source={active.kind}
      onLoad={(event) => onLoad?.(event)}
      onError={(event) => {
        onError?.(event);
        setSourceIndex((current) => Math.min(current + 1, sources.length - 1));
      }}
    />
  );
}
