import type * as Leaflet from "leaflet";
import type { maplibreGL } from "@maplibre/maplibre-gl-leaflet";

export type BasemapMode = "vector" | "standard";
export type BasemapState = BasemapMode | "loading";
export type BasemapController = {
  use: (mode: BasemapMode) => void;
  retry: () => void;
  dispose: () => void;
};

const attribution =
  '<a href="https://openfreemap.org/">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function createVectorBasemap(
  L: typeof Leaflet,
  map: Leaflet.Map,
  callbacks: {
    onState: (state: BasemapState, fallback: boolean) => void;
    onTileError: (failed: boolean) => void;
  },
): BasemapController {
  let disposed = false;
  let generation = 0;
  let requested: BasemapMode = "vector";
  let vector: ReturnType<typeof maplibreGL> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let removeListeners: (() => void) | undefined;
  let failedTiles = 0;
  const streets = L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    },
  );
  streets.on("loading", () => {
    failedTiles = 0;
  });
  streets.on("tileerror", () => {
    failedTiles += 1;
  });
  streets.on("load", () => {
    if (!disposed && map.hasLayer(streets))
      callbacks.onTileError(failedTiles > 0);
  });

  function removeVector() {
    clearTimeout(deadline);
    removeListeners?.();
    removeListeners = undefined;
    // Removing the bridge also releases its MapLibre map and worker resources.
    if (vector && map.hasLayer(vector)) map.removeLayer(vector);
    vector = undefined;
  }

  function showStreets(fallback: boolean) {
    if (disposed) return;
    generation += 1;
    removeVector();
    callbacks.onTileError(false);
    if (!map.hasLayer(streets)) streets.addTo(map);
    callbacks.onState("standard", fallback);
  }

  function showVector() {
    const run = ++generation;
    removeVector();
    if (map.hasLayer(streets)) map.removeLayer(streets);
    callbacks.onTileError(false);
    callbacks.onState("loading", false);
    const active = () => !disposed && generation === run;
    deadline = setTimeout(() => {
      if (active()) showStreets(true);
    }, 15_000);

    void Promise.all([
      import("@maplibre/maplibre-gl-leaflet"),
      import("maplibre-gl"),
      import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
      import("maplibre-gl/dist/maplibre-gl.css"),
    ])
      .then(([bridge, renderer, worker]) => {
        if (!active()) return;
        renderer.setWorkerUrl(worker.default);
        vector = bridge.maplibreGL({
          style: "https://tiles.openfreemap.org/styles/positron",
          interactive: false,
          attributionControl: { customAttribution: attribution },
        });
        vector.addTo(map);
        vector.getContainer().setAttribute("aria-hidden", "true");
        vector.getContainer().inert = true;
        const gl = vector.getMaplibreMap();
        let loaded = false;
        let errors = 0;
        const onLoad = () => {
          if (!active()) return;
          loaded = true;
          clearTimeout(deadline);
          callbacks.onState("vector", false);
          callbacks.onTileError(false);
        };
        const onError = () => {
          if (!active()) return;
          errors += 1;
          if (!loaded || errors >= 4) showStreets(true);
          else callbacks.onTileError(true);
        };
        const onIdle = () => {
          if (!active() || !loaded) return;
          errors = 0;
          callbacks.onTileError(false);
        };
        const onContextLost = () => {
          if (active()) showStreets(true);
        };
        gl.on("load", onLoad);
        gl.on("error", onError);
        gl.on("idle", onIdle);
        gl.on("webglcontextlost", onContextLost);
        removeListeners = () => {
          gl.off("load", onLoad);
          gl.off("error", onError);
          gl.off("idle", onIdle);
          gl.off("webglcontextlost", onContextLost);
        };
        if (gl.loaded()) onLoad();
      })
      .catch(() => {
        if (active()) showStreets(true);
      });
  }

  showVector();
  return {
    use(mode) {
      if (disposed) return;
      requested = mode;
      if (mode === "standard") showStreets(false);
      else showVector();
    },
    retry() {
      if (disposed) return;
      if (requested === "vector") showVector();
      else {
        callbacks.onTileError(false);
        streets.redraw();
      }
    },
    dispose() {
      disposed = true;
      generation += 1;
      removeVector();
      streets.off();
      if (map.hasLayer(streets)) map.removeLayer(streets);
    },
  };
}
