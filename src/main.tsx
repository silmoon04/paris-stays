import React, {
  Suspense,
  lazy,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Download,
  Eye,
  EyeOff,
  Heart,
  House,
  Info,
  MapPin,
  MessageSquare,
  Minus,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Star,
  Toilet,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  checks,
  confirmed,
  contradictions,
  coverIndex,
  fact,
  factDisplay,
  FIELDS,
  FACT_LABELS,
  money,
  ranking,
  TRIP,
  value,
  walkingMinutes,
  ZONES,
  type Stay,
  type Snapshot,
  type Detail,
} from "./domain";
import {
  DEFAULT_FILTERS,
  facet,
  matches,
  recovery,
  type Filters,
  type Rule,
} from "./filters";
import {
  EMPTY,
  loadWorkspace,
  saveWorkspace,
  cleanWorkspace,
  mergeWorkspace,
  readSharedIds,
  sharedUrl,
  type Workspace,
  type RecordItem,
  type Activity,
} from "./persistence";
import "./styles.css";
const StayMap = lazy(() => import("./StayMap"));
const date = (s: string) =>
  !Number.isFinite(Date.parse(s))
    ? "Not recorded"
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      }).format(new Date(s));
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    headingId = useId();
  useEffect(() => {
    const dialog = ref.current,
      previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus();
      else document.getElementById("results")?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={headingId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Photo({
  stay,
  className,
  onClick,
}: {
  stay: Stay;
  className: string;
  onClick: () => void;
}) {
  const [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false);
  const index = coverIndex(stay),
    url = stay.photos[index]?.url;
  return (
    <button
      className={className + " photo-container"}
      onClick={onClick}
      aria-label={"View " + stay.title}
    >
      {url && !failed ? (
        <img
          src={url + (url.includes("?") ? "&" : "?") + "im_w=720"}
          alt={stay.photos[index]?.caption || stay.title}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={loaded ? "loaded" : ""}
        />
      ) : (
        <span className="photo-fallback">
          <House size={25} />
          Photo unavailable
        </span>
      )}
      <span className="photo-count">
        {stay.enrichment?.photoReview?.interiorPhotos === false
          ? "Exterior photos only"
          : `${stay.photos.length} photos`}
      </span>
      {stay.enrichment?.deepReview && (
        <span className="photo-checked">
          <Check size={11} />
          Closer photo review
        </span>
      )}
    </button>
  );
}
function Price({ stay }: { stay: Stay }) {
  return (
    <div className="price">
      <strong>{money(stay.quote.total)}</strong>
      <span>for 4 nights</span>
      <small>
        {stay.quote.complete
          ? "Fees & taxes included"
          : "Full price needs checking"}
      </small>
    </div>
  );
}
function StayCard({
  stay,
  record,
  compare,
  onOpen,
  onSave,
  onHide,
  onCompare,
  onHover,
}: {
  stay: Stay;
  record?: RecordItem;
  compare: boolean;
  onOpen: () => void;
  onSave: () => void;
  onHide: () => void;
  onCompare: () => void;
  onHover: (id: string | null) => void;
}) {
  const unknown = checks(stay),
    bad = contradictions(stay),
    wc = value(stay, "toilets"),
    beds = value(stay, "properBeds"),
    walk = walkingMinutes(stay);
  return (
    <article
      className="stay-card"
      data-testid={"stay-" + stay.id}
      onMouseEnter={() => onHover(stay.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="card-image">
        <Photo stay={stay} className="card-photo" onClick={onOpen} />
        <button
          className={"save-heart " + (record?.saved ? "saved" : "")}
          aria-label={
            (record?.saved ? "Edit saved note for " : "Save ") + stay.title
          }
          onClick={onSave}
        >
          <Heart size={20} fill={record?.saved ? "#ff385c" : "white"} />
        </button>
        {record?.viewedAt && <span className="viewed-mark">Viewed</span>}
      </div>
      <div className="card-content">
        <div className="card-topline">
          <span>
            {stay.zones.map((z) => ZONES[z].short).join(" / ") ||
              "Outside your areas"}
          </span>
          <span className="rating">
            <Star size={12} fill="currentColor" />
            {stay.rating ?? "—"} <small>({stay.reviewCount ?? 0})</small>
          </span>
        </div>
        <button className="card-title" onClick={onOpen}>
          <h2>{stay.title}</h2>
        </button>
        <div className="card-facts">
          <span>
            <BedDouble size={15} />
            {typeof beds === "number"
              ? `${factDisplay(stay, "properBeds")} proper beds`
              : `${stay.advertisedBeds ?? "?"} beds advertised`}
          </span>
          <span>
            <Toilet size={15} />
            {typeof wc === "number"
              ? `${factDisplay(stay, "toilets")} WCs`
              : "WCs to check"}
          </span>
          <span>{stay.bedrooms ?? "?"} bedrooms</span>
        </div>
        <p className="card-desc">{stay.enrichment?.summary || stay.summary}</p>
        <div
          className={
            "fit-label " +
            (confirmed(stay) ? "confirmed" : bad.length ? "mismatch" : "")
          }
        >
          <i />
          {confirmed(stay)
            ? "Confirmed match"
            : bad.length
              ? "Known mismatch"
              : "Needs confirmation"}
          {unknown.length > 0 && !bad.length && (
            <small> · {unknown.length} details</small>
          )}
        </div>
        <p className="fit-explanation">
          {bad.length
            ? bad.slice(0, 2).join(" · ")
            : unknown.length
              ? unknown.slice(0, 3).join(" · ")
              : ranking(stay).reasons.slice(0, 3).join(" · ")}
        </p>
        <div className="card-bottom">
          <div>
            <span className="walk">
              <Clock size={13} />
              {walk === null ? "Walk to check" : `≈${walk} min walk to Louvre`}
            </span>
            <div className="card-actions">
              <button className={compare ? "pressed" : ""} onClick={onCompare}>
                {compare ? <Check size={13} /> : <Plus size={13} />}Compare
              </button>
              <button onClick={onHide}>
                <EyeOff size={13} />
                {record?.hidden ? "Restore" : "Hide"}
              </button>
            </div>
          </div>
          <Price stay={stay} />
        </div>
        {record?.whyLike && (
          <p className="personal-note">
            <MessageSquare size={13} />
            {record.whyLike}
          </p>
        )}
        {record?.hidden && record.whyNot && (
          <p className="personal-note">
            <EyeOff size={13} />
            Hidden because: {record.whyNot}
          </p>
        )}
      </div>
    </article>
  );
}
function Evidence({ stay, detail }: { stay: Stay; detail?: Detail }) {
  const facts = { ...stay.facts, ...stay.enrichment?.facts };
  return (
    <div className="evidence-grid">
      {FIELDS.map((f) => {
        const item = facts[f.key];
        return (
          <div key={f.key} className={!item ? "unknown-fact" : ""}>
            <span>{f.label}</span>
            <strong>
              {item
                ? typeof item.value === "boolean"
                  ? item.value
                    ? "Yes"
                    : "No"
                  : Array.isArray(item.value)
                    ? item.value.join(", ")
                    : `${item.extent === "at-least" ? "At least " : ""}${item.value}${f.unit ? " " + f.unit : ""}${item.conflicts?.length ? " � conflicting evidence" : ""}`
                : "Not stated"}
            </strong>
            {item && (
              <details>
                <summary>
                  {item.source === "photos"
                    ? "Seen in photos"
                    : item.source === "reviews"
                      ? "Review evidence"
                      : "Listing says"}{" "}
                  · {item.confidence}
                </summary>
                <p>{item.evidence}</p>
                <small>Reviewed {date(item.reviewedAt)}</small>
                {item.conflicts?.map((c) => (
                  <p className="warning" key={c}>
                    {c}
                  </p>
                ))}
              </details>
            )}
          </div>
        );
      })}
      <div>
        <span>Bathing rooms advertised</span>
        <strong>{stay.bathrooms ?? "Not stated"}</strong>
        <small>This is separate from toilet count.</small>
      </div>
      {detail?.cancellation.length ? (
        <div>
          <span>Cancellation terms</span>
          <p>{detail.cancellation.join(" · ")}</p>
        </div>
      ) : null}
    </div>
  );
}
function StayDetails({
  stay,
  onClose,
  onSave,
  onHide,
  onActivity,
  record,
}: {
  stay: Stay;
  onClose: () => void;
  onSave: () => void;
  onHide: () => void;
  onActivity: (
    t: Activity["type"],
    id?: string,
    d?: Record<string, unknown>,
  ) => void;
  record?: RecordItem;
}) {
  const [index, setIndex] = useState(coverIndex(stay)),
    [detail, setDetail] = useState<Detail>(),
    [detailError, setDetailError] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const control = new AbortController();
    fetch(import.meta.env.BASE_URL + "data/details/" + stay.id + ".json", {
      signal: control.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setDetail)
      .catch((e) => {
        if (e.name !== "AbortError") setDetailError(true);
      });
    return () => control.abort();
  }, [stay.id]);
  const photo = stay.photos[index],
    review = stay.enrichment?.photoReview;
  const change = (i: number) => {
    setIndex(i);
    setFailed(false);
    onActivity("photo", stay.id, { index: i });
  };
  const bad = contradictions(stay),
    todo = checks(stay);
  return (
    <Modal title={stay.title} onClose={onClose} wide>
      <div className="detail-body">
        <div className="detail-gallery">
          <div className="large-photo">
            {photo && !failed ? (
              <img
                src={
                  photo.url +
                  (photo.url.includes("?") ? "&" : "?") +
                  "im_w=1440"
                }
                alt={photo.caption || stay.title}
                onError={() => setFailed(true)}
              />
            ) : (
              <div className="photo-fallback">
                <House />
                Photo unavailable
              </div>
            )}
            <button
              className="gallery-prev"
              aria-label="Previous photo"
              onClick={() =>
                change((index - 1 + stay.photos.length) % stay.photos.length)
              }
              disabled={!stay.photos.length}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              className="gallery-next"
              aria-label="Next photo"
              onClick={() => change((index + 1) % stay.photos.length)}
              disabled={!stay.photos.length}
            >
              <ArrowRight size={18} />
            </button>
            <span className="photo-count">
              {index + 1} / {stay.photos.length}
            </span>
          </div>
          <p className="caption">{photo?.caption || "Listing photograph"}</p>
          <div className="photo-categories">
            <button onClick={() => change(coverIndex(stay))}>Best view</button>
            {(
              [
                ["Kitchen", review?.kitchenPhotoIndices, "kitchen|dining"],
                [
                  "Bathrooms",
                  review?.bathroomPhotoIndices,
                  "bath|shower|toilet",
                ],
                ["Beds", review?.bedPhotoIndices, "bedroom|bed"],
                ["Access", review?.accessPhotoIndices, "entrance|stairs|lift"],
              ] as const
            ).map(([label, indices, pattern]) => {
              const i =
                indices?.[0] ??
                stay.photos.findIndex((p) =>
                  new RegExp(pattern, "i").test(p.caption),
                );
              return (
                <button
                  key={label}
                  disabled={i < 0 || i === undefined}
                  onClick={() => change(i!)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="thumbnails">
            {stay.photos.map((p, i) => (
              <button
                key={i}
                className={index === i ? "selected" : ""}
                onClick={() => change(i)}
                aria-label={"Photo " + (i + 1) + ": " + p.caption}
              >
                <img
                  src={p.url + (p.url.includes("?") ? "&" : "?") + "im_w=160"}
                  alt=""
                  loading="lazy"
                />
              </button>
            ))}
          </div>
          {review && (
            <p className="photo-basis">
              Photo selection: {review.bestPhotoReason} ·{" "}
              {review.viewedPhotoIndices.length} images inspected by GPT-6 Luna.
            </p>
          )}
          {stay.enrichment?.deepReview && (
            <p className="deep-note">
              <Check size={16} />
              {stay.enrichment.deepReview.note}
            </p>
          )}
          {review?.issues.length ? (
            <ul className="warnings">
              {review.issues.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <aside className="booking-summary">
          <span className="rating">
            <Star size={15} fill="currentColor" />
            {stay.rating ?? "No rating"} · {stay.reviewCount ?? 0} reviews
          </span>
          <Price stay={stay} />
          <div className="trip-box">
            <span>
              <CalendarDays size={16} />
              31 Oct–4 Nov 2026
            </span>
            <span>
              <Users size={16} />5 adults · 4 nights
            </span>
          </div>
          <p className="quote-time">
            Quote checked {date(stay.quote.checkedAt)}. Prices and availability
            can change.
          </p>
          {stay.quote.fees.map((f, i) => (
            <div key={i} className="fee-row">
              <span>{f.label}</span>
              <b>{money(f.amount)}</b>
            </div>
          ))}
          {!stay.quote.complete && (
            <p className="warning">
              Mandatory fees or taxes are not fully confirmed. This is not a
              verified all-in price.
            </p>
          )}
          <a
            className="primary-button"
            href={stay.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onActivity("source", stay.id)}
          >
            Check on Airbnb <ArrowUpRight size={17} />
          </a>
          <div className="booking-actions">
            <button onClick={onSave}>
              <Heart size={16} />
              {record?.saved ? "Saved · edit note" : "Save with a note"}
            </button>
            <button onClick={onHide}>
              <EyeOff size={16} />
              {record?.hidden ? "Restore home" : "Hide with a reason"}
            </button>
          </div>
          <div className="verification">
            <h3>
              {bad.length
                ? "Does not fit"
                : todo.length
                  ? "Before booking"
                  : "Meets core requirements"}
            </h3>
            {bad.length ? (
              <ul>
                {bad.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : todo.length ? (
              <ul>
                {todo.map((x) => (
                  <li key={x}>Confirm {x.toLowerCase()}</li>
                ))}
              </ul>
            ) : (
              <p>Supported by the collected listing evidence.</p>
            )}
            <p>
              {value(stay, "toilets") === 2
                ? "Two toilets are allowed, with a penalty against your three-WC preference."
                : ""}
            </p>
          </div>
          <div className="ranking">
            <h3>Why this appears here</h3>
            {ranking(stay).reasons.map((x) => (
              <span key={x}>
                <Check size={12} />
                {x}
              </span>
            ))}
          </div>
          <p className="walk">
            <Clock size={15} />≈{walkingMinutes(stay) ?? "?"} min walk to the
            Louvre
          </p>
          <small>
            Estimated from the approximate listing location, with a
            street-distance allowance. This is not a routed or step-free
            journey.
          </small>
          <a
            className="directions"
            target="_blank"
            rel="noopener noreferrer"
            href={
              "https://www.google.com/maps/dir/?api=1&origin=" +
              stay.lat +
              "," +
              stay.lon +
              "&destination=48.8606,2.3353&travelmode=walking"
            }
          >
            Open walking directions <ArrowUpRight size={13} />
          </a>
        </aside>
      </div>
      <section className="detail-section">
        <h3>Sleeping and access</h3>
        {(value(stay, "showerLayout") === "over-bath" ||
          value(stay, "showerLayout") === "both") && (
          <p className="warning">
            An over-bath shower requires stepping over the bath edge.{" "}
            {value(stay, "showerLayout") === "both"
              ? "A separate shower is also supported by the evidence; check which bathroom each guest will use."
              : "Confirm the bath-edge height and any support rails with the host."}
          </p>
        )}
        <div className="sleep-layout">
          <div>
            <BedDouble size={20} />
            <strong>{factDisplay(stay, "properBeds")} proper beds</strong>
            <span>
              {stay.advertisedBeds ?? "?"} advertised · {stay.bedrooms ?? "?"}{" "}
              bedrooms
            </span>
          </div>
          <ArrowRight size={18} />
          <div>
            <Users size={20} />
            <strong>{stay.capacity ?? "?"} guests allowed</strong>
            <span>Five in your group</span>
          </div>
          <ArrowRight size={18} />
          <div>
            <House size={20} />
            <strong>
              {value(stay, "lift") === true
                ? "Lift advertised"
                : Number(value(stay, "floor")) === 0
                  ? "Ground floor stated"
                  : "Access to check"}
            </strong>
            <span>
              {fact(stay, "accessSuitable")?.evidence ||
                "Entrance and internal stairs need confirmation"}
            </span>
          </div>
        </div>
        <p>
          {fact(stay, "bedLayout")?.evidence ||
            fact(stay, "properBeds")?.evidence ||
            "The advertised bed count may include sofa beds. Confirm the exact bed arrangement with the host."}
        </p>
      </section>
      <section className="detail-section">
        <h3>Listing, photo and review evidence</h3>
        <Evidence stay={stay} detail={detail} />
      </section>
      <section className="detail-section">
        <h3>What guests say</h3>
        {stay.enrichment?.reviewSummary ? (
          <>
            <p>
              AI summary of {stay.enrichment.reviewSummary.sampleCount} sampled
              reviews; this is not the full review history.
            </p>
            <ul>
              {stay.enrichment.reviewSummary.themes.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <ul className="warnings">
              {[
                ...stay.enrichment.reviewSummary.concerns,
                ...stay.enrichment.reviewSummary.conflicts,
              ].map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>
            Review text has not been analysed for this home. The rating and
            count above are listing data.
          </p>
        )}
      </section>
      <section className="detail-section">
        <h3>Listing description</h3>
        {detailError ? (
          <p>
            Details could not load.{" "}
            <a href={stay.url} target="_blank" rel="noreferrer">
              Read the original listing.
            </a>
          </p>
        ) : (
          <p className="description">
            {detail?.description || "Loading listing details…"}
          </p>
        )}
        {detail?.rules.length ? <p>{detail.rules.join(" · ")}</p> : null}
      </section>
    </Modal>
  );
}
function FiltersPanel({
  stays,
  filters,
  onChange,
  onClose,
}: {
  stays: Stay[];
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const rule = (key: string, r: Rule | undefined) => {
    const next = { ...filters.rules };
    if (r) next[key] = r;
    else delete next[key];
    onChange({ ...filters, rules: next });
  };
  const groups = [...new Set(FIELDS.map((f) => f.group))];
  return (
    <Modal title="Filters with evidence counts" onClose={onClose}>
      <div className="filters-body">
        <section className="filter-group">
          <h3>Search & area</h3>
          <label className="filter-label">
            Search homes or features
            <input
              aria-label="Filter search text"
              type="search"
              value={filters.query}
              placeholder="Kitchen, bedrooms, features…"
              onChange={(e) => onChange({ ...filters, query: e.target.value })}
            />
          </label>
          <label className="filter-label">
            Search area
            <select
              value={filters.zone}
              onChange={(e) =>
                onChange({
                  ...filters,
                  zone: e.target.value as Filters["zone"],
                })
              }
            >
              <option value="all">Both circled areas</option>
              <option value="west">Louvre & Opéra</option>
              <option value="east">Les Halles & Pompidou</option>
              <option value="collected">All collected Paris homes</option>
            </select>
          </label>
        </section>
        <div className="filter-notice">
          <Info size={18} />
          <p>
            Missing details stay included. Numbers show homes matching your
            other filters, plus those with this detail unknown.
          </p>
        </div>
        <label className="toggle-row">
          <span>
            <b>Include unknown information</b>
            <small>
              Exclude known contradictions, keep homes you can check.
            </small>
          </span>
          <input
            type="checkbox"
            checked={filters.includeUnknown}
            onChange={(e) =>
              onChange({ ...filters, includeUnknown: e.target.checked })
            }
          />
        </label>
        <label className="toggle-row">
          <span>
            <b>Confirmed matches only</b>
            <small>
              Requires evidence for every core requirement, including the full
              price.
            </small>
          </span>
          <input
            type="checkbox"
            checked={filters.onlyConfirmed}
            onChange={(e) =>
              onChange({ ...filters, onlyConfirmed: e.target.checked })
            }
          />
        </label>
        <label className="toggle-row">
          <span>
            <b>Show known mismatches</b>
            <small>
              Include homes that fail a core requirement within the chosen area.
            </small>
          </span>
          <input
            type="checkbox"
            checked={filters.includeExcluded}
            onChange={(e) =>
              onChange({ ...filters, includeExcluded: e.target.checked })
            }
          />
        </label>
        <section className="filter-group">
          <h3>Price & reviews</h3>
          <label className="filter-label">
            Whole-stay maximum <b>{money(filters.priceMax)}</b>
            <input
              aria-label="Whole-stay maximum"
              type="range"
              min="500"
              max="5000"
              step="100"
              value={filters.priceMax}
              onChange={(e) =>
                onChange({ ...filters, priceMax: Number(e.target.value) })
              }
            />
          </label>
          <label className="filter-label">
            Minimum rating
            <select
              value={filters.ratingMin ?? ""}
              onChange={(e) =>
                onChange({
                  ...filters,
                  ratingMin: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">Any rating</option>
              {[4.5, 4.7, 4.8, 4.9].map((n) => {
                const c = facet(stays, filters, "rating", { min: n });
                return (
                  <option key={n} value={n}>
                    {n}+ · {c.known} known + {c.unknown} unknown
                  </option>
                );
              })}
            </select>
          </label>
          <label className="filter-label">
            Minimum review count
            <select
              value={filters.minReviews ?? ""}
              onChange={(e) =>
                onChange({
                  ...filters,
                  minReviews: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">Any review count</option>
              {[10, 20, 50, 100].map((n) => {
                const c = facet(stays, filters, "reviewCount", { min: n });
                return (
                  <option key={n} value={n}>
                    {n}+ · {c.known} known + {c.unknown} unknown
                  </option>
                );
              })}
            </select>
          </label>
        </section>
        {groups.map((group) => (
          <section className="filter-group" key={group}>
            <h3>{group}</h3>
            {FIELDS.filter((f) => f.group === group).map((field) => {
              const active = filters.rules[field.key];
              const unknown = facet(stays, filters, field.key, {}).unknown;
              return (
                <div className="field-filter" key={field.key}>
                  <label
                    id={"label-" + field.key}
                    htmlFor={"field-" + field.key}
                  >
                    {field.label}
                    <small>{unknown} unknown</small>
                  </label>
                  {field.kind === "boolean" ? (
                    <div
                      className="choice-buttons"
                      role="group"
                      aria-labelledby={"label-" + field.key}
                    >
                      {[
                        { label: "Any", r: undefined },
                        { label: "Yes", r: { eq: true } },
                        { label: "No", r: { eq: false } },
                      ].map(({ label, r }) => {
                        const c = facet(stays, filters, field.key, r ?? {});
                        return (
                          <button
                            key={label}
                            aria-pressed={
                              (!active && !r) ||
                              (active?.eq !== undefined && active.eq === r?.eq)
                            }
                            aria-label={`${field.label}: ${label}, ${c.known} known matches, ${c.unknown} unknown`}
                            className={
                              (!active && !r) ||
                              (active?.eq !== undefined && active.eq === r?.eq)
                                ? "pressed"
                                : ""
                            }
                            onClick={() => rule(field.key, r)}
                          >
                            {label}
                            <small>
                              {r
                                ? `${c.known}${filters.includeUnknown && c.unknown ? " +" + c.unknown + "?" : ""}`
                                : c.known + c.unknown}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <select
                      id={"field-" + field.key}
                      value={
                        field.kind === "number"
                          ? active?.min !== undefined
                            ? "min:" + active.min
                            : active?.max !== undefined
                              ? "max:" + active.max
                              : ""
                          : String(active?.eq ?? "")
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        rule(
                          field.key,
                          !v
                            ? undefined
                            : field.kind === "number"
                              ? v.startsWith("min:")
                                ? { min: Number(v.slice(4)) }
                                : { max: Number(v.slice(4)) }
                              : { eq: v },
                        );
                      }}
                    >
                      <option value="">Any · unknown included</option>
                      {field.kind === "enum"
                        ? field.options?.map((o) => {
                            const c = facet(stays, filters, field.key, {
                              eq: o.value,
                            });
                            return (
                              <option key={o.value} value={o.value}>
                                {o.label} · {c.known} +{" "}
                                {filters.includeUnknown ? c.unknown : 0} unknown
                              </option>
                            );
                          })
                        : (field.key === "entranceSteps" ||
                          field.key === "floor"
                            ? [0, 1, 2, 3, 5, 10]
                            : field.key === "areaM2"
                              ? [40, 60, 80, 100, 120, 150]
                              : Array.from(
                                  { length: Math.min(field.max ?? 8, 10) },
                                  (_, i) => i + 1,
                                )
                          ).map((n) => {
                            const max =
                                field.key === "entranceSteps" ||
                                field.key === "floor",
                              r = max ? { max: n } : { min: n },
                              c = facet(stays, filters, field.key, r);
                            return (
                              <option
                                key={n}
                                value={(max ? "max:" : "min:") + n}
                              >
                                {max ? "Up to " : ""}
                                {n}
                                {max ? "" : "+"} {field.unit} · {c.known} +{" "}
                                {filters.includeUnknown ? c.unknown : 0} unknown
                              </option>
                            );
                          })}
                    </select>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <div className="modal-footer">
        <button
          className="text-button"
          onClick={() => onChange(structuredClone(DEFAULT_FILTERS))}
        >
          Reset filters
        </button>
        <button className="primary-button" onClick={onClose}>
          Show {stays.filter((s) => matches(s, filters)).length} homes
        </button>
      </div>
    </Modal>
  );
}
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(),
    [loadError, setLoadError] = useState(false),
    [filters, setFilters] = useState<Filters>(structuredClone(DEFAULT_FILTERS)),
    [previous, setPrevious] = useState<Filters>(),
    [filterOpen, setFilterOpen] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [hovered, setHovered] = useState<string | null>(null),
    [sort, setSort] = useState("fit"),
    [limit, setLimit] = useState(12),
    [compare, setCompare] = useState<string[]>([]),
    [compareOpen, setCompareOpen] = useState(false),
    [workspace, setWorkspace] = useState<Workspace>(structuredClone(EMPTY)),
    [storageReady, setStorageReady] = useState(false),
    [storageError, setStorageError] = useState(false),
    [tab, setTab] = useState(() =>
      readSharedIds(location.hash).length ? "shared" : "results",
    ),
    [personalOpen, setPersonalOpen] = useState(false),
    [infoOpen, setInfoOpen] = useState(false),
    [note, setNote] = useState<{
      id: string;
      type: "save" | "hide";
      text: string;
    }>(),
    [toast, setToast] = useState(""),
    [bounds, setBounds] = useState<[number, number, number, number]>(),
    [sheet, setSheet] = useState<"peek" | "half" | "full">("half"),
    [shared, setShared] = useState(() => readSharedIds(location.hash));
  const importer = useRef<HTMLInputElement>(null),
    dragStart = useRef<number | null>(null),
    dragMoved = useRef(false),
    lastMap = useRef(0);
  const stays = snapshot?.stays ?? [];
  useEffect(() => {
    const ac = new AbortController();
    fetch(import.meta.env.BASE_URL + "data/search.json", { signal: ac.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setSnapshot)
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError(true);
      });
    loadWorkspace()
      .then(setWorkspace)
      .catch(() => setStorageError(true))
      .finally(() => setStorageReady(true));
    const hash = () => {
      const ids = readSharedIds(location.hash);
      setShared(ids);
      if (ids.length) setTab("shared");
    };
    window.addEventListener("hashchange", hash);
    return () => {
      ac.abort();
      window.removeEventListener("hashchange", hash);
    };
  }, []);
  useEffect(() => {
    if (storageReady)
      void saveWorkspace(workspace).catch(() => setStorageError(true));
  }, [workspace, storageReady]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  const activity = (
    type: Activity["type"],
    id?: string,
    data: Record<string, unknown> = {},
  ) =>
    setWorkspace((w) =>
      w.activityEnabled
        ? {
            ...w,
            activity: [
              ...w.activity
                .filter((e) => e.at > Date.now() - 90 * 86400000)
                .slice(-2999),
              {
                id: crypto.randomUUID(),
                type,
                listingId: id,
                at: Date.now(),
                data,
              },
            ],
          }
        : w,
    );
  const changeRecord = (id: string, patch: Partial<RecordItem>) =>
    setWorkspace((w) => ({
      ...w,
      records: {
        ...w.records,
        [id]: {
          ...(w.records[id] ?? {
            saved: false,
            hidden: false,
            whyLike: "",
            whyNot: "",
            viewedAt: null,
          }),
          ...patch,
          updatedAt: Date.now(),
        },
      },
    }));
  const open = (id: string) => {
    setSelected(id);
    changeRecord(id, { viewedAt: Date.now() });
    activity("open", id, { source: "details" });
  };
  const apply = (next: Filters) => {
    setPrevious(filters);
    setFilters(next);
    setLimit(12);
    activity("filter", undefined, { filters: next });
  };
  const toggleCompare = (id: string) => {
    setCompare((v) =>
      v.includes(id)
        ? v.filter((x) => x !== id)
        : v.length < 3
          ? [...v, id]
          : v,
    );
    if (!compare.includes(id) && compare.length >= 3)
      setToast("Compare up to three homes. Remove one first.");
    activity("compare", id);
  };
  const quickCount = (key: string, r: Rule) => {
    const c = facet(base, effective, key, r);
    return `${c.known}${filters.includeUnknown && c.unknown ? " + " + c.unknown + " unknown" : ""}`;
  };
  const save = (id: string) =>
    setNote({ id, type: "save", text: workspace.records[id]?.whyLike ?? "" });
  const hide = (id: string) => {
    if (workspace.records[id]?.hidden) {
      changeRecord(id, { hidden: false });
      activity("restore", id);
      setToast("Home restored.");
    } else
      setNote({ id, type: "hide", text: workspace.records[id]?.whyNot ?? "" });
  };
  const saved = useMemo(
      () =>
        new Set(
          Object.entries(workspace.records)
            .filter(([, r]) => r.saved)
            .map(([id]) => id),
        ),
      [workspace.records],
    ),
    viewed = useMemo(
      () =>
        new Set(
          Object.entries(workspace.records)
            .filter(([, r]) => r.viewedAt)
            .map(([id]) => id),
        ),
      [workspace.records],
    );
  const base = useMemo(
    () =>
      stays.filter((s) =>
        tab === "saved"
          ? saved.has(s.id)
          : tab === "hidden"
            ? workspace.records[s.id]?.hidden
            : tab === "viewed"
              ? viewed.has(s.id)
              : tab === "shared"
                ? shared.includes(s.id)
                : !workspace.records[s.id]?.hidden,
      ),
    [stays, tab, saved, viewed, shared, workspace.records],
  );
  const effective =
    tab === "results"
      ? filters
      : {
          ...filters,
          zone: "collected" as const,
          includeExcluded: true,
          priceMax: Math.max(
            filters.priceMax,
            ...base.map((s) => s.quote.total ?? 0),
          ),
        };
  const filtered = useMemo(
    () =>
      base
        .filter((s) => matches(s, effective))
        .sort((a, b) =>
          sort === "price"
            ? (a.quote.total ?? Infinity) - (b.quote.total ?? Infinity)
            : sort === "walk"
              ? (walkingMinutes(a) ?? Infinity) -
                (walkingMinutes(b) ?? Infinity)
              : sort === "reviews"
                ? (b.rating ?? 0) - (a.rating ?? 0) ||
                  (b.reviewCount ?? 0) - (a.reviewCount ?? 0)
                : ranking(b).score - ranking(a).score,
        ),
    [base, filters, tab, sort],
  );
  const picked = stays.find((s) => s.id === selected),
    confirmedCount = filtered.filter(confirmed).length,
    activeCount =
      Object.keys(filters.rules).length +
      Number(filters.ratingMin !== null) +
      Number(filters.minReviews !== null) +
      Number(filters.onlyConfirmed) +
      Number(!filters.includeUnknown) +
      Number(filters.includeExcluded);
  const share = async () => {
    const ids = tab === "shared" ? shared : [...saved];
    if (!ids.length) {
      setToast("Save a few homes to share a shortlist.");
      return;
    }
    const url = sharedUrl(ids, location.href.split("#")[0]);
    try {
      await navigator.clipboard.writeText(url);
      setToast("Shortlist link copied. Your notes stay private.");
    } catch {
      setToast("Link ready in the address bar. Copy it to share.");
      location.hash = new URL(url).hash;
    }
  };
  const exportNotes = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(workspace, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "paris-stays-notes.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <a className="skip-link" href="#results">
        Skip to homes
      </a>
      <header className="app-header">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-symbol">
            <House size={22} />
          </span>
          <span>paris stays</span>
        </a>
        <div className="trip-pill">
          <span>Paris, France</span>
          <i />
          <span>31 Oct–4 Nov</span>
          <i />
          <span>5 guests</span>
          <span className="search-circle">
            <Search size={16} />
          </span>
        </div>
        <nav>
          <button
            className="header-button"
            onClick={() => {
              setPersonalOpen(true);
              activity("navigation", undefined, { tab: "activity" });
            }}
          >
            <Clock size={17} />
            <span>My notes</span>
          </button>
          <button
            className="header-button"
            onClick={() => {
              setTab("saved");
              setSheet("full");
              activity("navigation", undefined, { tab: "saved" });
            }}
          >
            <Heart size={17} />
            <span>Shortlist</span>
            <b>{saved.size}</b>
          </button>
          <button
            className="share-header"
            aria-label="Share shortlist"
            onClick={() => void share()}
          >
            <Share2 size={17} />
          </button>
        </nav>
      </header>
      <div className="app-layout">
        <main
          id="results"
          tabIndex={-1}
          className={"results-panel sheet-" + sheet}
        >
          <button
            className="sheet-handle"
            aria-label="Change results panel height"
            onClick={() => {
              if (!dragMoved.current)
                setSheet((s) =>
                  s === "half" ? "full" : s === "full" ? "peek" : "half",
                );
              dragMoved.current = false;
            }}
            onPointerDown={(e) => {
              dragStart.current = e.clientY;
              dragMoved.current = false;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={(e) => {
              if (dragStart.current !== null) {
                const diff = e.clientY - dragStart.current;
                if (Math.abs(diff) > 35) {
                  dragMoved.current = true;
                  setSheet(diff > 0 ? "peek" : "full");
                }
                dragStart.current = null;
              }
            }}
            onPointerCancel={() => {
              dragStart.current = null;
              dragMoved.current = false;
            }}
          >
            <span />
            <small>{filtered.length} homes</small>
          </button>
          <div className="results-scroll">
            <div className="page-heading">
              <div>
                <h1>A home for five in Paris</h1>
                <p>Four nights near the Louvre · 31 Oct–4 Nov 2026</p>
              </div>
              <button
                className="filter-button"
                onClick={() => setFilterOpen(true)}
              >
                <SlidersHorizontal size={17} />
                Filters{activeCount > 0 && <b>{activeCount}</b>}
              </button>
            </div>
            <div className="search-row">
              <label className="search-input">
                <Search size={18} />
                <input
                  aria-label="Search homes or details"
                  placeholder="Search homes, features or details"
                  value={filters.query}
                  onChange={(e) => apply({ ...filters, query: e.target.value })}
                />
                {filters.query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => apply({ ...filters, query: "" })}
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
              <select
                aria-label="Search area"
                value={filters.zone}
                onChange={(e) =>
                  apply({ ...filters, zone: e.target.value as Filters["zone"] })
                }
              >
                <option value="all">Both circled areas</option>
                <option value="west">Louvre & Opéra</option>
                <option value="east">Les Halles & Pompidou</option>
                <option value="collected">All collected Paris homes</option>
              </select>
            </div>
            <div className="quick-filters">
              <button
                onClick={() => {
                  const rules = { ...filters.rules };
                  if (rules.toilets) delete rules.toilets;
                  else rules.toilets = { min: 3 };
                  apply({ ...filters, rules });
                }}
                className={filters.rules.toilets ? "pressed" : ""}
              >
                <Toilet size={15} />
                3+ toilets <small>{quickCount("toilets", { min: 3 })}</small>
              </button>
              <button
                onClick={() => {
                  const rules = { ...filters.rules };
                  if (rules.lift) delete rules.lift;
                  else rules.lift = { eq: true };
                  apply({ ...filters, rules });
                }}
                className={filters.rules.lift ? "pressed" : ""}
              >
                Lift <small>{quickCount("lift", { eq: true })}</small>
              </button>
              <button
                onClick={() => {
                  const rules = { ...filters.rules };
                  if (rules.diningSeats) delete rules.diningSeats;
                  else rules.diningSeats = { min: 5 };
                  apply({ ...filters, rules });
                }}
                className={filters.rules.diningSeats ? "pressed" : ""}
              >
                Table for five{" "}
                <small>{quickCount("diningSeats", { min: 5 })}</small>
              </button>
              <button onClick={() => setFilterOpen(true)}>
                More filters <ChevronDown size={13} />
              </button>
            </div>
            <div className="criteria-line">
              <span>4 proper beds</span>
              <span>2+ WCs</span>
              <span>£2,500 total max</span>
              <button
                onClick={() =>
                  apply({ ...filters, includeUnknown: !filters.includeUnknown })
                }
              >
                {filters.includeUnknown
                  ? "Unknowns included"
                  : "Unknowns excluded in filters"}
              </button>
              {filters.bounds && (
                <button
                  onClick={() => apply({ ...filters, bounds: undefined })}
                >
                  Map area <X size={11} />
                </button>
              )}
              {previous && (
                <button onClick={() => apply(previous)}>Undo</button>
              )}
              {activeCount > 0 && (
                <button onClick={() => apply(structuredClone(DEFAULT_FILTERS))}>
                  Reset
                </button>
              )}
            </div>
            <div className="view-tabs">
              {[
                ["results", "All homes"],
                ["saved", "Saved " + saved.size],
                ["viewed", "Viewed " + viewed.size],
                [
                  "hidden",
                  "Hidden " +
                    Object.values(workspace.records).filter((r) => r.hidden)
                      .length,
                ],
                ...(shared.length
                  ? [["shared", "Shared " + shared.length]]
                  : []),
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={tab === id ? "active" : ""}
                  onClick={() => {
                    setTab(id);
                    setLimit(12);
                    activity("navigation", undefined, { tab: id });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="results-meta">
              <div aria-live="polite" aria-atomic="true">
                <strong>
                  {filtered.length} {filtered.length === 1 ? "home" : "homes"}
                </strong>
                <span>
                  {snapshot
                    ? snapshot.meta.uniqueListings +
                      " scraped · " +
                      confirmedCount +
                      " confirmed · " +
                      (filtered.length - confirmedCount) +
                      " to check"
                    : "Collecting your search…"}
                </span>
              </div>
              <label>
                <ArrowDownUp size={14} />
                <select
                  aria-label="Sort homes"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="fit">Best fit</option>
                  <option value="price">Lowest total</option>
                  <option value="walk">Closest to Louvre</option>
                  <option value="reviews">Highest rating</option>
                </select>
              </label>
              <button
                className="icon-button"
                onClick={() => setInfoOpen(true)}
                aria-label="Search snapshot information"
              >
                <Info size={17} />
              </button>
            </div>
            {storageError && (
              <p className="warning">
                Browser storage is unavailable. Notes work for this session;
                export them before closing.
              </p>
            )}
            {loadError && (
              <div className="empty-state">
                <h2>The search could not load</h2>
                <p>
                  Check your connection, then reload. Saved notes remain in this
                  browser.
                </p>
                <button onClick={() => location.reload()}>Reload search</button>
              </div>
            )}
            {!snapshot && !loadError && (
              <div className="skeleton-list" aria-label="Loading homes">
                {[1, 2, 3].map((n) => (
                  <div key={n} />
                ))}
              </div>
            )}
            {snapshot && !filtered.length && (
              <div className="empty-state">
                <House size={32} />
                <h2>
                  {tab === "saved"
                    ? "Your shortlist starts here"
                    : tab === "hidden"
                      ? "No hidden homes"
                      : "No homes with these filters"}
                </h2>
                <p>
                  {tab === "saved"
                    ? "Save a home and write what you like about it."
                    : "Unknown details are common. Try relaxing one filter without changing your essential requirements."}
                </p>
                {recovery(base, effective).map((r) => (
                  <button key={r.label} onClick={() => apply(r.filters)}>
                    {r.label.replace(
                      /properBeds|diningSeats|accessSuitable|toilets/g,
                      (s) => FACT_LABELS[s] ?? s,
                    )}{" "}
                    · {r.count} homes
                  </button>
                ))}
                <button
                  className="primary-button"
                  onClick={() => {
                    setTab("results");
                    apply(structuredClone(DEFAULT_FILTERS));
                  }}
                >
                  Reset to your trip
                </button>
              </div>
            )}
            <div className="home-list">
              {filtered.slice(0, limit).map((s) => (
                <StayCard
                  key={s.id}
                  stay={s}
                  record={workspace.records[s.id]}
                  compare={compare.includes(s.id)}
                  onOpen={() => open(s.id)}
                  onSave={() => save(s.id)}
                  onHide={() => hide(s.id)}
                  onCompare={() => toggleCompare(s.id)}
                  onHover={setHovered}
                />
              ))}
            </div>
            {filtered.length > limit && (
              <button
                className="show-more"
                onClick={() => setLimit((v) => v + 16)}
              >
                Show {Math.min(16, filtered.length - limit)} more homes
              </button>
            )}
            {snapshot && (
              <footer className="results-footer">
                Snapshot {date(snapshot.meta.collectedAt)} ·{" "}
                <button onClick={() => setInfoOpen(true)}>
                  Coverage & evidence
                </button>
                <p>
                  Listing photos and information belong to their respective
                  hosts. Verify the final price and access on Airbnb.
                </p>
              </footer>
            )}
          </div>
        </main>
        <Suspense
          fallback={
            <div className="map-loading">
              <MapPin size={30} />
              Loading Paris map…
            </div>
          }
        >
          <StayMap
            stays={filtered}
            hovered={hovered}
            selected={selected}
            saved={saved}
            viewed={viewed}
            onHover={(id) => {
              setHovered(id);
            }}
            onOpen={open}
            onBounds={(b) => {
              setBounds(b);
              if (Date.now() - lastMap.current > 4000) {
                activity("map", undefined, { bounds: b });
                lastMap.current = Date.now();
              }
            }}
            onSearch={() => {
              apply({ ...filters, bounds });
              setSheet("half");
            }}
            mapFiltered={!!filters.bounds}
            sheet={sheet}
          />
        </Suspense>
      </div>
      {compare.length > 0 && (
        <div className="compare-bar">
          <span>{compare.length} selected</span>
          <button
            className="primary-button"
            onClick={() => setCompareOpen(true)}
          >
            Compare homes
          </button>
          <button
            className="icon-button"
            aria-label="Clear comparison"
            onClick={() => setCompare([])}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {filterOpen && (
        <FiltersPanel
          stays={base}
          filters={effective}
          onChange={apply}
          onClose={() => setFilterOpen(false)}
        />
      )}{" "}
      {picked && (
        <StayDetails
          key={picked.id}
          stay={picked}
          record={workspace.records[picked.id]}
          onClose={() => setSelected(null)}
          onSave={() => save(picked.id)}
          onHide={() => hide(picked.id)}
          onActivity={activity}
        />
      )}
      {note && (
        <Modal
          title={note.type === "save" ? "Save this home" : "Hide this home"}
          onClose={() => setNote(undefined)}
        >
          <form
            className="note-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (note.type === "save") {
                changeRecord(note.id, { saved: true, whyLike: note.text });
                activity("save", note.id);
              } else {
                changeRecord(note.id, { hidden: true, whyNot: note.text });
                activity("hide", note.id);
                setSelected(null);
              }
              setToast(
                note.type === "save"
                  ? "Saved with your note."
                  : "Hidden. Find it again in Hidden.",
              );
              setNote(undefined);
            }}
          >
            <p>{stays.find((s) => s.id === note.id)?.title}</p>
            <label>
              {note.type === "save"
                ? "What do you like?"
                : "Why is it not a fit?"}
              <textarea
                autoFocus
                rows={4}
                maxLength={2000}
                value={note.text}
                onChange={(e) => setNote({ ...note, text: e.target.value })}
                placeholder={
                  note.type === "save"
                    ? "The kitchen, bedrooms, location…"
                    : "Too many stairs, small table, bathroom layout…"
                }
              />
            </label>
            <small>Optional. Stored privately in this browser.</small>
            <div className="modal-footer">
              {note.type === "save" && saved.has(note.id) && (
                <button
                  type="button"
                  onClick={() => {
                    changeRecord(note.id, { saved: false });
                    setNote(undefined);
                  }}
                >
                  Remove from shortlist
                </button>
              )}
              <button type="submit" className="primary-button">
                {note.type === "save" ? "Save home" : "Hide home"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {compareOpen && (
        <Modal
          title="Compare your homes"
          onClose={() => setCompareOpen(false)}
          wide
        >
          <div className="comparison">
            <table>
              <thead>
                <tr>
                  <th>Details</th>
                  {compare.map((id) => {
                    const s = stays.find((x) => x.id === id);
                    return (
                      <th key={id}>
                        <button
                          onClick={() => {
                            setCompareOpen(false);
                            open(id);
                          }}
                        >
                          {s?.title}
                          <ArrowUpRight size={13} />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {[
                  ["price", "Four-night total"],
                  ["fit", "Status"],
                  ["properBeds", "Proper beds"],
                  ["bedrooms", "Bedrooms"],
                  ["toilets", "Toilets / WCs"],
                  ["bathrooms", "Bathing rooms"],
                  ["showers", "Showers"],
                  ["lift", "Lift"],
                  ["floor", "Floor"],
                  ["accessSuitable", "No flights needed"],
                  ["diningSeats", "Dining seats"],
                  ["kitchen", "Kitchen"],
                  ["rating", "Rating / reviews"],
                  ["walk", "Walk to Louvre"],
                ].map(([key, label]) => (
                  <tr key={key}>
                    <th>{label}</th>
                    {compare.map((id) => {
                      const s = stays.find((x) => x.id === id)!;
                      const v = value(s, key);
                      const display =
                        key === "price"
                          ? money(s.quote.total) +
                            (s.quote.complete ? " incl. taxes" : " · to verify")
                          : key === "fit"
                            ? confirmed(s)
                              ? "Confirmed"
                              : contradictions(s).length
                                ? "Mismatch"
                                : "To check"
                            : key === "rating"
                              ? `${s.rating ?? "?"} (${s.reviewCount ?? 0})`
                              : key === "walk"
                                ? `≈${walkingMinutes(s) ?? "?"} min`
                                : key === "bathrooms"
                                  ? String(s.bathrooms ?? "Unknown")
                                  : v === undefined
                                    ? "Unknown"
                                    : typeof v === "boolean"
                                      ? v
                                        ? "Yes"
                                        : "No"
                                      : factDisplay(s, key);
                      return <td key={id}>{display}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
      {infoOpen && snapshot && (
        <Modal
          title="Search coverage & evidence"
          onClose={() => setInfoOpen(false)}
        >
          <div className="info-body">
            <p>
              <b>{snapshot.meta.uniqueListings} unique listings</b> from{" "}
              {snapshot.meta.rawRows} collected rows. {snapshot.meta.inAreas}{" "}
              fall within the approximate circled areas.
            </p>
            <p>{snapshot.meta.coverage}</p>
            <ul>
              {snapshot.meta.searches.map((s, i) => (
                <li key={i}>
                  {s.label}: {s.count} rows
                </li>
              ))}
            </ul>
            <p>
              Apify cost: <b>${snapshot.meta.chargedUsd.toFixed(4)} / $5</b>.
            </p>
            <p>
              {stays.filter((s) => s.enrichment).length} homes structured by
              GPT-6 Luna ·{" "}
              {stays.filter((s) => s.enrichment?.photoReview).length} with
              inspected photos ·{" "}
              {stays.filter((s) => s.enrichment?.deepReview).length} reviewed
              more closely.
            </p>
            <p>
              A rating is listing data. Photo observations describe what is
              visible. Neither proves the current condition or a complete
              step-free route. WC counts stay separate from bathroom counts.
            </p>
            <p>
              Dates are fixed to this search snapshot. Filters do not call paid
              APIs.
            </p>
          </div>
        </Modal>
      )}
      {personalOpen && (
        <Modal
          title="Your notes & activity"
          onClose={() => setPersonalOpen(false)}
        >
          <div className="info-body">
            <p>
              Saved homes, hidden reasons and recent activity stay in this
              browser. No account or shared database is required.
            </p>
            <div className="personal-tools">
              <button onClick={exportNotes}>
                <Download size={16} />
                Export notes
              </button>
              <button onClick={() => importer.current?.click()}>
                <Upload size={16} />
                Import notes
              </button>
              <button onClick={() => void share()}>
                <Share2 size={16} />
                Share shortlist
              </button>
              <input
                ref={importer}
                hidden
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    if (file.size > 5_000_000)
                      throw new Error("Choose an export under 5 MB.");
                    const incoming = cleanWorkspace(
                      JSON.parse(await file.text()),
                    );
                    setWorkspace((w) => mergeWorkspace(w, incoming));
                    setToast("Notes imported.");
                  } catch (error) {
                    setToast(
                      error instanceof Error ? error.message : "Import failed.",
                    );
                  }
                  e.target.value = "";
                }}
              />
            </div>
            <label className="toggle-row">
              <span>
                <b>Record activity</b>
                <small>
                  Opens, photos, filters, map moves and notes; retained for 90
                  days.
                </small>
              </span>
              <input
                type="checkbox"
                checked={workspace.activityEnabled}
                onChange={(e) =>
                  setWorkspace((w) => ({
                    ...w,
                    activityEnabled: e.target.checked,
                  }))
                }
              />
            </label>
            <button
              className="text-button"
              onClick={() => {
                setWorkspace((w) => ({ ...w, activity: [] }));
                setToast("Activity cleared. Saved notes remain.");
              }}
            >
              Clear activity
            </button>
            <h3>Recent activity</h3>
            <div className="activity-list">
              {workspace.activity
                .slice(-25)
                .reverse()
                .map((e) => (
                  <div key={e.id}>
                    <span>{e.type}</span>
                    {e.listingId && (
                      <button
                        onClick={() => {
                          setPersonalOpen(false);
                          open(e.listingId!);
                        }}
                      >
                        {stays.find((s) => s.id === e.listingId)?.title ||
                          e.listingId}
                      </button>
                    )}
                    <time>{date(new Date(e.at).toISOString())}</time>
                  </div>
                ))}
            </div>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
