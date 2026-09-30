// Airbnb's image CDN only accepts certain resize widths, including 240 for thumbnails.
export type ImageWidth = 240 | 480 | 720 | 1440;
export function imageCandidates(source: string, width: ImageWidth, localUrl?: string): string[] {
  const local = localUrl && /^\/paris-stays\/photos\/[a-f0-9]{24}\.(?:jpg|webp|png)$/.test(localUrl) ? [localUrl] : [];
  try {
    const original = new URL(source);
    original.searchParams.delete("im_w");
    const sized = new URL(original);
    sized.searchParams.set("im_w", String(width));
    return [...new Set([...local, sized.href, original.href])];
  } catch {
    return [...local, ...(source ? [source] : [])];
  }
}
