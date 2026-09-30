import {
  ArrowUpRight,
  Church,
  Footprints,
  Landmark,
  TowerControl,
} from "lucide-react";
import { LANDMARKS, walkingMinutes, type Stay } from "./domain";
const icons = { louvre: Landmark, eiffel: TowerControl, notreDame: Church };
export function WalkTimes({
  stay,
  compact = false,
}: {
  stay: Stay;
  compact?: boolean;
}) {
  return (
    <div className={"walk-times " + (compact ? "compact" : "")}>
      <span className="walk-heading">
        <Footprints size={14} aria-hidden="true" />
        Estimated walks
      </span>
      {LANDMARKS.map((place) => {
        const minutes = walkingMinutes(stay, place.coordinates),
          Icon = icons[place.id];
        return (
          <a
            key={place.id}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Walking directions to ${place.name}${minutes === null ? "" : `, approximately ${minutes} minutes`}`}
            href={
              minutes === null
                ? undefined
                : `https://www.google.com/maps/dir/?api=1&origin=${stay.lat},${stay.lon}&destination=${place.coordinates.join(",")}&travelmode=walking`
            }
            aria-disabled={minutes === null || undefined}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{place.name}</span>
            <strong>{minutes === null ? "To check" : `≈${minutes} min`}</strong>
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        );
      })}
      <small>
        Approximate location · distance estimate, not a routed or step-free
        journey.
      </small>
    </div>
  );
}
