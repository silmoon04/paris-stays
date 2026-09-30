import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Heart, RotateCcw, Search, Star, X } from "lucide-react";
import type * as Leaflet from "leaflet";
import {
  coverIndex,
  factDisplay,
  ranking,
  money,
  value,
  ZONES,
  LOUVRE,
  type Stay,
} from "./domain";
import { ListingImage } from "./ListingImage";
import { FactIcon } from "./FactIcon";
import { WalkTimes } from "./WalkTimes";
import { mergeOverlappingGroups } from "./map-clusters";
import { createVectorBasemap, type BasemapController } from "./vector-basemap";
import "leaflet/dist/leaflet.css";
type Props = {
  stays: Stay[];
  hovered: string | null;
  selected: string | null;
  saved: Set<string>;
  viewed: Set<string>;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
  onBounds: (b: [number, number, number, number]) => void;
  onSearch: () => void;
  mapFiltered: boolean;
  sheet: "peek" | "half" | "full";
};
type Pin = {
  marker: Leaflet.Marker;
  button: HTMLButtonElement;
  items: Stay[];
  key: string;
};
export default function StayMap(props: Props) {
  const el = useRef<HTMLDivElement>(null),
    runtime = useRef<
      | {
          L: typeof Leaflet;
          map: Leaflet.Map;
          base: BasemapController;
          pins: Map<string, Pin>;
        }
      | undefined
    >(undefined),
    latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false),
    [status, setStatus] = useState("Loading map…"),
    [preview, setPreview] = useState<{
      items: Stay[];
      left: number;
      top: number;
    } | null>(null);
  const timers = useRef<{
    show?: ReturnType<typeof setTimeout>;
    hide?: ReturnType<typeof setTimeout>;
  }>({});
  const hide = () => {
    clearTimeout(timers.current.show);
    timers.current.hide = setTimeout(() => {
      setPreview(null);
      latest.current.onHover(null);
    }, 190);
  };
  const fitAreas = (map: Leaflet.Map) => {
    const mobile = window.matchMedia("(max-width:760px)").matches;
    const height = map.getSize().y;
    const obstruction =
      latest.current.sheet === "peek"
        ? 105
        : latest.current.sheet === "half"
          ? height * 0.52
          : height - 135;
    map.fitBounds(
      [
        [48.855, 2.316],
        [48.878, 2.362],
      ],
      mobile && latest.current.sheet !== "full"
        ? {
            paddingTopLeft: [18, 150],
            paddingBottomRight: [18, obstruction + 14],
            animate: false,
          }
        : { padding: [30, 40], animate: false },
    );
  };
  useEffect(() => {
    let alive = true;
    let resize: ResizeObserver | undefined;
    void import("leaflet")
      .then((L) => {
        if (!alive || !el.current) return;
        const map = L.map(el.current, {
          zoomControl: true,
          minZoom: 10,
          maxZoom: 19,
          attributionControl: true,
          zoomSnap: 0.25,
          zoomDelta: 0.5,
        });
        fitAreas(map);
        const base = createVectorBasemap(L, map, {
          onState: (s, fall) =>
            setStatus(
              s === "loading"
                ? "Loading map…"
                : fall
                  ? "Street map · vector unavailable"
                  : s === "vector"
                    ? ""
                    : "Street map",
            ),
          onTileError: (failed) => {
            if (failed) setStatus("Some map tiles unavailable");
          },
        });
        for (const [zone, area] of Object.entries(ZONES)) {
          const [s, w, n, e] = area.bounds;
          L.rectangle(
            [
              [s, w],
              [n, e],
            ],
            {
              color: zone === "west" ? "#d64e69" : "#488f87",
              weight: 1.5,
              dashArray: "5 6",
              fillOpacity: 0.035,
              interactive: false,
            },
          ).addTo(map);
        }
        L.marker(LOUVRE, {
          icon: L.divIcon({
            className: "landmark",
            html: '<span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 9 9-6 9 6H3Z M5 10v8 M10 10v8 M14 10v8 M19 10v8 M3 21h18"/></svg>Louvre</span>',
            iconSize: [90, 28],
            iconAnchor: [45, 14],
          }),
          interactive: false,
        }).addTo(map);
        const report = () => {
          const b = map.getBounds();
          if (
            window.matchMedia("(max-width:760px)").matches &&
            latest.current.sheet !== "full"
          ) {
            const height = map.getSize().y,
              obstruction =
                latest.current.sheet === "peek" ? 105 : height * 0.52;
            const nw = map.containerPointToLatLng([0, 150]),
              se = map.containerPointToLatLng([
                map.getSize().x,
                height - obstruction,
              ]);
            latest.current.onBounds([se.lat, nw.lng, nw.lat, se.lng]);
          } else
            latest.current.onBounds([
              b.getSouth(),
              b.getWest(),
              b.getNorth(),
              b.getEast(),
            ]);
          setPreview(null);
          latest.current.onHover(null);
          renderPins();
        };
        map.on("moveend zoomend", report);
        runtime.current = { L, map, base, pins: new Map() };
        let lastWidth = map.getSize().x;
        resize = new ResizeObserver(() => {
          map.invalidateSize();
          const width = map.getSize().x;
          if (Math.abs(width - lastWidth) > 80) fitAreas(map);
          lastWidth = width;
        });
        resize.observe(el.current);
        setReady(true);
        report();
      })
      .catch(() => setStatus("Map unavailable. All homes remain in the list."));
    return () => {
      alive = false;
      clearTimeout(timers.current.show);
      clearTimeout(timers.current.hide);
      resize?.disconnect();
      runtime.current?.base.dispose();
      runtime.current?.map.remove();
      runtime.current = undefined;
    };
  }, []);
  function renderPins() {
    const r = runtime.current;
    if (!r) return;
    const { L, map, pins } = r;
    const stays = latest.current.stays.filter(
      (s) =>
        s.lat !== null &&
        s.lon !== null &&
        map.getBounds().pad(0.15).contains([s.lat!, s.lon!]),
    );
    const center = (items: Stay[]) => {
      const lat = items.reduce((n, s) => n + s.lat!, 0) / items.length,
        lon = items.reduce((n, s) => n + s.lon!, 0) / items.length;
      return map.latLngToContainerPoint([lat, lon]);
    };
    const groups = mergeOverlappingGroups(
        stays.map((s) => [s]),
        center,
        { width: (items) => (items.length > 1 ? 110 : 83), height: 40 },
      ),
      keep = new Set<string>();
    for (const items of groups) {
      const key = items
        .map((s) => s.id)
        .sort()
        .join(",");
      keep.add(key);
      const coordinate: [number, number] = [
        items.reduce((n, s) => n + s.lat!, 0) / items.length,
        items.reduce((n, s) => n + s.lon!, 0) / items.length,
      ];
      let pin = pins.get(key);
      if (!pin) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "price-pin";
        const marker = L.marker(coordinate, {
          icon: L.divIcon({
            html: button,
            className: "pin-container",
            iconSize: [items.length > 1 ? 110 : 83, 38],
            iconAnchor: [items.length > 1 ? 55 : 41.5, 19],
          }),
          keyboard: false,
        }).addTo(map);
        pin = { marker, button, items, key };
        pins.set(key, pin);
        button.addEventListener("click", () => {
          const p = pins.get(key);
          if (!p) return;
          if (p.items.length === 1) {
            latest.current.onOpen(p.items[0].id);
            setPreview(null);
          } else {
            clearTimeout(timers.current.hide);
            const pt = map.latLngToContainerPoint(marker.getLatLng());
            setPreview({ items: p.items, left: pt.x, top: pt.y });
          }
        });
        button.addEventListener("mouseenter", () => {
          clearTimeout(timers.current.show);
          clearTimeout(timers.current.hide);
          timers.current.show = setTimeout(() => {
            const p = pins.get(key);
            if (!p) return;
            const pt = map.latLngToContainerPoint(marker.getLatLng());
            setPreview({ items: p.items, left: pt.x, top: pt.y });
            latest.current.onHover(p.items[0].id);
          }, 120);
        });
        button.addEventListener("mouseleave", hide);
        button.addEventListener("focus", () => {
          const p = pins.get(key);
          if (!p) return;
          clearTimeout(timers.current.hide);
          const pt = map.latLngToContainerPoint(marker.getLatLng());
          setPreview({ items: p.items, left: pt.x, top: pt.y });
          latest.current.onHover(p.items[0].id);
        });
        button.addEventListener("blur", hide);
      }
      pin.items = [...items].sort(
        (a, b) =>
          ranking(b).score - ranking(a).score || a.id.localeCompare(b.id),
      );
      pin.marker.setLatLng(coordinate);
      const prices = items
          .map((s) => s.quote.total)
          .filter((n): n is number => n !== null),
        amount = prices.length ? Math.min(...prices) : null;
      pin.button.textContent = `${money(amount)}${items.length > 1 ? " +" + (items.length - 1) : ""}${items.some((s) => latest.current.saved.has(s.id)) ? " ♥" : ""}`;
      pin.button.setAttribute(
        "aria-label",
        items.length > 1
          ? `${items.length} homes from ${money(amount)}, show homes`
          : `Open ${items[0].title}, ${money(amount)} for four nights`,
      );
      pin.button.title =
        items.length === 1 ? items[0].title : items.length + " nearby homes";
    }
    for (const [k, p] of pins)
      if (!keep.has(k)) {
        map.removeLayer(p.marker);
        pins.delete(k);
      }
    highlight();
  }
  function highlight() {
    const p = latest.current;
    runtime.current?.pins.forEach((pin) => {
      pin.button.classList.toggle(
        "active",
        pin.items.some((s) => s.id === p.hovered || s.id === p.selected),
      );
      pin.button.classList.toggle(
        "viewed",
        pin.items.every((s) => p.viewed.has(s.id)),
      );
      pin.marker.setZIndexOffset(
        pin.items.some((s) => s.id === p.hovered || s.id === p.selected)
          ? 1000
          : 0,
      );
    });
  }
  useEffect(() => {
    renderPins();
  }, [ready, props.stays, props.saved, props.viewed]);
  useEffect(() => {
    highlight();
  }, [props.hovered, props.selected]);
  useEffect(() => {
    if (!ready) return;
    clearTimeout(timers.current.show);
    clearTimeout(timers.current.hide);
    if (!props.hovered) {
      timers.current.hide = setTimeout(() => setPreview(null), 190);
      return () => clearTimeout(timers.current.hide);
    }
    const home = props.stays.find((s) => s.id === props.hovered),
      r = runtime.current;
    if (!home || !r) return;
    const pin = [...r.pins.values()].find((p) =>
      p.items.some((s) => s.id === home.id),
    );
    const pt = pin
      ? r.map.latLngToContainerPoint(pin.marker.getLatLng())
      : { x: r.map.getSize().x / 2, y: 100 };
    timers.current.show = setTimeout(
      () =>
        setPreview((current) =>
          current?.items[0].id === home.id
            ? current
            : {
                items: [home],
                left: pt.x,
                top: pt.y,
              },
        ),
      120,
    );
    return () => clearTimeout(timers.current.show);
  }, [ready, props.hovered, props.stays]);
  useEffect(() => {
    if (ready && runtime.current && props.sheet !== "full")
      fitAreas(runtime.current.map);
  }, [ready, props.sheet]);
  const stay = preview?.items[0],
    photo = stay?.photos[coverIndex(stay)];
  const width = Math.min(286, (el.current?.clientWidth ?? 340) - 28),
    left = preview
      ? Math.max(
          14,
          Math.min(
            preview.left - width / 2,
            (el.current?.clientWidth ?? 0) - width - 14,
          ),
        )
      : 0,
    top = preview
      ? Math.max(
          75,
          Math.min(
            preview.top + 24,
            (el.current?.clientHeight ?? 500) -
              (preview.items.length > 1 ? 610 : 500),
          ),
        )
      : 0;
  return (
    <section className="map-section" aria-label="Map of Paris homes">
      <div className="map-canvas" ref={el} />
      <div className="map-toolbar">
        <button
          className="white-button"
          onClick={() => runtime.current && fitAreas(runtime.current.map)}
        >
          <RotateCcw size={15} /> Both areas
        </button>
        <button
          className={"white-button " + (props.mapFiltered ? "pressed" : "")}
          onClick={props.onSearch}
        >
          <Search size={15} />
          {props.mapFiltered ? "Update map search" : "Search this map"}
        </button>
      </div>
      {status && (
        <div className="map-status">
          {status}
          <button
            onClick={() => runtime.current?.base.retry()}
            aria-label="Retry vector map"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      )}
      <div className="map-legend">
        <span>
          <i className="west-dot" />
          Louvre & Opéra
        </span>
        <span>
          <i className="east-dot" />
          Les Halles & Pompidou
        </span>
        <small>Prices for 4 nights · approximate locations</small>
      </div>
      {preview && stay && (
        <div
          className="map-preview"
          style={{
            left,
            top,
            width,
            maxHeight: Math.max(
              120,
              (el.current?.clientHeight ?? 500) - top - 18,
            ),
          }}
          onMouseEnter={() => {
            clearTimeout(timers.current.hide);
            props.onHover(stay.id);
          }}
          onMouseLeave={hide}
        >
          <button
            className="preview-close"
            aria-label="Close map preview"
            onClick={() => {
              setPreview(null);
              props.onHover(null);
            }}
          >
            <X size={16} />
          </button>
          <button
            className="preview-photo"
            aria-label={"View " + stay.title}
            onClick={() => props.onOpen(stay.id)}
          >
            <ListingImage
              url={photo?.url}
              alt={photo?.caption || stay.title}
              width={480}
              eager
            />
          </button>
          <div className="preview-info">
            <button
              className="text-button"
              onClick={() => props.onOpen(stay.id)}
            >
              <strong>{stay.title}</strong>
              <ArrowUpRight size={15} />
            </button>
            <p>
              <Star size={13} fill="currentColor" />{" "}
              {stay.rating ?? "No rating"} · {stay.reviewCount ?? "?"} reviews
            </p>
            <p>
              <FactIcon name="properBeds" size={14} />
              {factDisplay(stay, "properBeds")} proper beds ·{" "}
              <FactIcon name="toilets" size={14} />
              {factDisplay(stay, "toilets")} WCs
            </p>
            <b>{money(stay.quote.total)}</b>
            <small>
              {" "}
              / 4 nights
              {stay.quote.complete ? " · incl. taxes" : " · total to verify"}
            </small>
            {props.saved.has(stay.id) && <Heart size={13} fill="#ff385c" />}
            <WalkTimes stay={stay} compact />
          </div>
          {preview.items.length > 1 && (
            <div className="cluster-list">
              {preview.items.slice(1).map((s) => (
                <button key={s.id} onClick={() => props.onOpen(s.id)}>
                  <span>{s.title}</span>
                  <b>{money(s.quote.total)}</b>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
