import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { imageCandidates, type ImageWidth } from "./images";
import { whenNearViewport } from "./loading";
import { logUsage } from "./telemetry";

export function ListingImage({
  url,
  localUrl,
  alt,
  width,
  thumbnail = false,
  eager = false,
  sizes,
}: {
  url?: string;
  localUrl?: string;
  alt: string;
  width: ImageWidth;
  thumbnail?: boolean;
  eager?: boolean;
  sizes?: string;
}) {
  return (
    <ImageAttempt
      key={(url ?? "") + width}
      url={url}
      localUrl={localUrl}
      alt={alt}
      width={width}
      thumbnail={thumbnail}
      eager={eager}
      sizes={sizes}
    />
  );
}
function ImageAttempt({
  url,
  localUrl,
  alt,
  width,
  thumbnail,
  eager,
  sizes,
}: {
  url?: string;
  localUrl?: string;
  alt: string;
  width: ImageWidth;
  thumbnail: boolean;
  eager: boolean;
  sizes?: string;
}) {
  const candidates = imageCandidates(url ?? "", width, localUrl);
  const started = useRef(performance.now());
  const container = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(eager);
  const [attempt, setAttempt] = useState(0),
    [loaded, setLoaded] = useState(false);
  const source = candidates[attempt];
  useEffect(() => {
    if (active || !container.current) return;
    return whenNearViewport(container.current, () => setActive(true));
  }, [active]);
  const widths = [240, 480, 720, 1440].filter((w) => w <= width) as ImageWidth[];
  const srcSet =
    attempt === 0 && !thumbnail && source?.includes("a0.muscache.com/")
      ? widths.map((w) => `${imageCandidates(url ?? "", w)[0]} ${w}w`).join(", ")
      : undefined;
  return (
    <span
      ref={container}
      aria-busy={active && !!source && !loaded || undefined}
      className={
        "listing-image " +
        (loaded ? "image-loaded" : "") +
        (thumbnail ? " thumbnail-image" : "")
      }
    >
      {!loaded && source && <span className="image-placeholder" aria-hidden="true" />}
      {source && active ? (
        <img
          src={source}
          srcSet={srcSet}
          sizes={srcSet ? sizes ?? `${width}px` : undefined}
          alt={alt}
          loading="eager"
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          className={loaded ? "loaded" : ""}
          onLoad={() => {
            setLoaded(true);
            logUsage("image_load", container.current?.closest<HTMLElement>("[data-listing-id]")?.dataset.listingId,
              { width, loadedMs: Math.round(performance.now() - started.current), category: thumbnail ? "thumbnail" : "photo", source: attempt ? "fallback" : localUrl ? "static-cache" : "cdn" });
          }}
          onError={() => {
            setLoaded(false);
            setAttempt((n) => n + 1);
            logUsage("image_error", container.current?.closest<HTMLElement>("[data-listing-id]")?.dataset.listingId,
              { width, index: attempt, category: thumbnail ? "thumbnail" : "photo", source: attempt ? "fallback" : localUrl ? "static-cache" : "cdn" });
          }}
        />
      ) : !source ? (
        <span
          className="photo-fallback"
          role="img"
          aria-label={alt + ": photo unavailable"}
        >
          <ImageOff size={thumbnail ? 16 : 25} />
          {!thumbnail && "Photo unavailable"}
        </span>
      ) : null}
    </span>
  );
}
