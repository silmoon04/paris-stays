const cache = new Map<string, unknown>();

export async function loadStaticJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  if (cache.has(url)) return cache.get(url) as T;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let retry = true;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        retry = response.status >= 500 || response.status === 429;
        throw new Error(`Could not load this file (${response.status})`);
      }
      const data = (await response.json()) as T;
      cache.set(url, data);
      return data;
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      if (!retry || attempt === 1) {
        if (controller.signal.aborted) throw new Error("Loading timed out. Try again.");
        throw error;
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  }
  throw new Error("Could not load this file");
}

type ImageWatch = { observer: IntersectionObserver; callbacks: Map<Element, () => void> };
const observers = new Map<Element | null, ImageWatch>();

export function whenNearViewport(element: Element, load: () => void) {
  if (typeof IntersectionObserver === "undefined") {
    load();
    return () => {};
  }
  const root = element.closest(".thumbnails, .results-scroll");
  let watch = observers.get(root);
  if (!watch) {
    const callbacks = new Map<Element, () => void>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          callbacks.get(entry.target)?.();
          callbacks.delete(entry.target);
          observer.unobserve(entry.target);
        }
        if (!callbacks.size) {
          observer.disconnect();
          if (observers.get(root)?.observer === observer) observers.delete(root);
        }
      },
      { root, rootMargin: "180px 100px", threshold: 0.01 },
    );
    watch = { observer, callbacks };
    observers.set(root, watch);
  }
  const group = watch;
  group.callbacks.set(element, load);
  group.observer.observe(element);
  return () => {
    group.callbacks.delete(element);
    group.observer.unobserve(element);
    if (!group.callbacks.size) {
      group.observer.disconnect();
      if (observers.get(root) === group) observers.delete(root);
    }
  };
}
