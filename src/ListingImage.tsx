import { useState } from "react";
import { ImageOff } from "lucide-react";
import { imageCandidates, type ImageWidth } from "./images";

export function ListingImage({
  url,
  alt,
  width,
  thumbnail = false,
  eager = false,
}: {
  url?: string;
  alt: string;
  width: ImageWidth;
  thumbnail?: boolean;
  eager?: boolean;
}) {
  return (
    <ImageAttempt
      key={(url ?? "") + width}
      url={url}
      alt={alt}
      width={width}
      thumbnail={thumbnail}
      eager={eager}
    />
  );
}
function ImageAttempt({
  url,
  alt,
  width,
  thumbnail,
  eager,
}: {
  url?: string;
  alt: string;
  width: ImageWidth;
  thumbnail: boolean;
  eager: boolean;
}) {
  const candidates = imageCandidates(url ?? "", width);
  const [attempt, setAttempt] = useState(0),
    [loaded, setLoaded] = useState(false);
  const source = candidates[attempt];
  return (
    <span
      className={
        "listing-image " +
        (loaded ? "image-loaded" : "") +
        (thumbnail ? " thumbnail-image" : "")
      }
    >
      {source ? (
        <img
          src={source}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className={loaded ? "loaded" : ""}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setAttempt((n) => n + 1);
          }}
        />
      ) : (
        <span
          className="photo-fallback"
          role="img"
          aria-label={alt + ": photo unavailable"}
        >
          <ImageOff size={thumbnail ? 16 : 25} />
          {!thumbnail && "Photo unavailable"}
        </span>
      )}
    </span>
  );
}
