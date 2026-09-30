# Optional laptop collector

The public site loads its static snapshot immediately, then checks `runtime.json` for an optional HTTPS collector. A missing laptop, broken tunnel or failed upload leaves maps, filters, photos and saved notes working. Configuration requests have a five-second deadline; background tunnel requests allow twelve seconds for slower connections. Offline connections retry once per minute. Batches stay in memory, capped at 600 events, and are discarded on page reload. Event IDs make retries safe to replay.

SQLite records are private at `.private/server/visits.sqlite`. The ingestion service binds to `127.0.0.1:8785`; Cloudflare forwards HTTPS requests to this port. It exposes health, anonymous session creation, event ingestion, deletion of the current visitor's records and the curated snapshot. The separate dashboard binds to `127.0.0.1:8786` and is never routed through the tunnel. Its endpoints reject remote origins and non-loopback Host headers. The public API has exact CORS origins, session tokens, request limits, body/batch limits, event allowlists and duplicate protection.

## Run on this laptop

```powershell
.\scripts\start-background.ps1 -InstallStartup
```

This starts a hidden process and installs the **Paris Stays Laptop Collector** task for the current user's next Windows logon. The scheduled action stays attached to the service so Task Scheduler can restart a failed process. A current-user Startup shortcut is the fallback if task registration is unavailable. Tunnel failures restart after 30 seconds. The laptop must be awake and online; no incoming router or firewall port is opened.

[Open the private local dashboard](http://127.0.0.1:8786/). It shows sessions, device/network hints, listing opens, active viewing time, Airbnb clicks, filters with counts and removed IDs, photo navigation and an event timeline. Click a session to inspect its events or export them as JSON. An event does not establish why someone made a choice. Records are never copied to GitHub.

To stop the current process:

```powershell
.\scripts\stop-background.ps1
```

To stop logon startup as well, disable the named task in Windows Task Scheduler. Logs, the current endpoint and the process ID are in `.private/server`. The stop script checks the project's command line and stops only this service and its tunnel child.

## Recorded fields

- Random visitor/session IDs, visits and referrer hostname without its path or query.
- Browser user agent, platform, language, timezone, viewport/screen size, pixel ratio and touch capability. Processor and memory hints may be absent or rounded.
- Browser-provided connection type, effective speed, round-trip estimate and data-saver state where available. Websites cannot read Wi-Fi names, passwords or MAC addresses.
- A salted hash of the request's network address and Cloudflare's country hint if supplied. Raw IP addresses are not saved.
- Semantic clicks, dropdown/checkbox choices, filters, result counts, removed listing IDs, map bounds and sustained hover previews.
- Listing opens, photo selection, image load/failure events, scroll depth, comparisons, saves/hides and outbound Airbnb clicks. Written reasons and notes are excluded.
- Visible, active viewing time, with a two-minute inactivity cutoff. Background-tab time is excluded. A small beacon sends the final segment when possible; browsers may drop it.

The notice and **My notes → Record activity** let visitors pause logging. Do Not Track and Global Privacy Control are honoured. Clearing activity requests deletion of that visitor's server records while connected; an offline deletion cannot reach the laptop, but local activity is still cleared. Server records expire after 90 days. Search text, written notes, passwords, Wi-Fi identifiers, precise geolocation, keystrokes and microphone/camera content are not collected. QA sessions are marked with `?qa=1` and excluded from visitor totals by default. The local dashboard can include them explicitly.

## Original share link and tunnel restarts

Quick Tunnels assign temporary hostnames. The supervisor checks a new tunnel's health, then updates only public `runtime.json` on the `gh-pages` branch using the authenticated GitHub CLI account. Failed updates retry in the background. The existing `https://silmoon04.github.io/paris-stays/` link stays unchanged. GitHub Pages deployment and DNS propagation can briefly delay reconnection after a restart.

Quick Tunnels have no uptime guarantee and are intended for development. This setup is for the small family search and has an intentional static fallback. A named tunnel and an owned domain would provide a stable collector hostname. See [Cloudflare's Quick Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## Phone photos and host drafts

`npx tsx scripts/cache-photos.ts` caches in-area cover photos and full galleries for current default matches. The site uses these static files first and retains Airbnb CDN URLs as fallbacks. This snapshot has 161 cached photos, about 7.2 MB total. Only images near the viewport load. Phone details have larger controls, horizontally scrolling categories and swipe navigation. Descriptions recover paragraphs, headings and lists without executing HTML.

Every unconfirmed home has a short, copyable draft. **My notes → Download host messages** exports messages and listing links for the current results. `npx tsx scripts/host-messages.ts` also writes the two current default drafts to private `artifacts/host-messages.txt` and `.json`. Nothing is sent through Airbnb automatically, and host replies are not yet imported.

## Publishing another build

Pull the private `gh-pages` checkout before running `node scripts/stage-static.mjs`. It copies only the public release files and preserves the newest runtime configuration from the build, current collector and Pages checkout, so a new build cannot restore an expired tunnel address. Review and push the staged checkout. Source staging remains `node scripts/stage-release.mjs`.
