import { Component, type ReactNode } from "react";
import { MapPin } from "lucide-react";

export function MapLoading() {
  return <div className="map-loading" role="status">
    <MapPin size={28} aria-hidden="true" />
    <strong>Loading Paris map</strong>
    <span className="loading-dot" aria-hidden="true" />
    <small>You can browse homes while the map loads.</small>
  </div>;
}

export class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="map-loading" role="alert">
      <MapPin size={28} aria-hidden="true" />
      <strong>The map could not load</strong>
      <small>Your saved notes remain in this browser.</small>
      <button onClick={() => location.reload()}>Reload map</button>
    </div> : this.props.children;
  }
}
