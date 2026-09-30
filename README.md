# Paris Stays

[Open the search](https://silmoon04.github.io/paris-stays/).

The optional laptop collector records anonymous visits, clicks, filters, photo navigation, active viewing time and Airbnb clicks while the laptop is online. It runs quietly, reconnects through the existing share link and stores records privately in SQLite. The static site stays usable when disconnected. See [COLLECTOR.md](COLLECTOR.md) for startup, the local dashboard, collected fields and privacy controls. In-area covers and current default galleries are cached on GitHub Pages for phone loading; unconfirmed listings have short copyable host drafts, and descriptions show headings and lists.

A separate Roomway-style search for one entire Paris home, 31 October–4 November 2026, five adults and a £2,500 whole-stay budget. The default filters require at least **four proper beds, three WCs and three bedrooms**. The approximate areas cover Louvre–Tuileries–Palais Royal–Opéra and Châtelet–Les Halles–Pompidou.

The app keeps WCs separate from bathing rooms and excludes sofa beds from proper-bed counts. WC and shower counts require supported listing text or structured listing data; photos and reviews never establish their numbers. Unknown, conflicting or low-confidence WC counts are excluded from search even when other unknown details are included. Known counts below the default minima are hidden. Filters can be relaxed deliberately; the underlying core requirements still exclude fewer than three proper beds or two WCs.

The vector map uses OpenFreeMap/MapLibre, with an attributed OpenStreetMap fallback. Prices are four-night GBP quotes. Locations and walking times are approximate. Hovering a result card or map pin shows a photo and estimated walks to the Louvre, Eiffel Tower and Notre-Dame. Direction links open a routed journey in Google Maps. Photo shortcuts, comparison of three homes and a mobile results sheet make the shortlist easier to assess.

Cards and evidence use matching facility icons. Known stair flights, upper floors explicitly without a lift, required internal stairs, and more than five entrance steps are excluded by default. Lift advertising does not establish a complete step-free route; missing entrance or internal access evidence remains unknown. Text-derived bed layouts are labelled as inferences, exclude sofa beds and avoid counting repeated room descriptions or alternative bed configurations twice.

Gallery thumbnails use a supported 240px Airbnb CDN size; all images can fall back to the original URL and display a placeholder if both requests fail. Reviews have a labelled AI summary and up to three brief literal guest excerpts without reviewer identities. Full review text stays private. Card descriptions use a short summary; the photo-selection rationale is no longer shown in the interface.

Outfit and the generated logo are bundled in the static build, including the font license. There are no Google Fonts requests at runtime. The search download contains one chosen cover per home, reducing its compressed size from 493 KB to 147 KB. Full gallery metadata loads from that home's static detail file when opened. Photos use responsive sizes and a shared IntersectionObserver so off-screen cards and thumbnails do not request images yet. A branded startup state, card skeletons, image placeholders, transient request retries and visible recovery controls cover slow or interrupted loads. See [ASSETS.md](ASSETS.md) for sources and the logo prompt.

## Snapshot and its limits

The September 2026 collection has 520 discovery rows, 346 unique listings and 135 within the two approximate areas. These counts describe this collection, not complete market coverage. Geographic URL searches returned broader Paris results, so area membership is checked against returned coordinates.

GPT-6 Luna workers structured 75 candidates and inspected photos for 43 homes. Ten leading candidates received closer review using full-resolution images. Every retained fact includes a source, evidence, confidence and review time. Photo-based bed counts are minimum observations. Bathroom, WC and shower numbers inferred from photos are discarded, and numeric bathroom claims are removed from AI prose. Bathroom photos remain available to inspect layout and appearance. Photos cannot prove measured floor area, current cleanliness or a complete stair-free route.

131 recent reviews were collected and joined to 16 homes. The lowest-rated review run returned zero rows. Direct dated quote rechecks also returned no rows: the detail actor reached its event-charge limit, and the discovery actor rejects individual listing URLs. Original discovery quotes are retained with their original check times. Missing cancellation details remain unknown. Always confirm the current Airbnb total, availability, actual bed arrangement and access route before booking.

Apify charges reconciled to **$2.7259**, below the shared **$5** cap. The pipeline reserves each run before submission and uses one locked ledger across keys. Phase limits are $2.50 discovery, $0.50 details, $1.50 reviews and $0.50 verification/retries. An uncertain submission retains its reservation and cannot be automatically repeated.

## Local use

Use Node 24 and Python 3.10+.

```sh
npm ci
npm run dev
npm test
python -m unittest discover -s tests -p 'test_*.py' -v
npm run build
npm run preview
```

Vite serves the `/paris-stays/` base path. The app loads a static snapshot; filtering never calls a paid API. The map and galleries load separately, and listing details load only when opened.

Notes, hidden reasons and viewing activity use the separate IndexedDB database `paris-stays-workspace-v1`. They stay in each browser. Export/import moves personal records between browsers; family links share only listing IDs. Activity can be paused or cleared and is retained for at most 90 days. There is no account, cloud telemetry endpoint or cross-device database sync.

## Collection and review

Set `APIFY_TOKEN` in the local environment, or use the existing parent `.env` with `APIFY_KEY_1`. Credentials never enter Vite. Actor inputs use the fixed dates, five adults, GBP and `enrichUserProfiles=false`.

```sh
python scripts/collect.py search --zone west --count 5 --cap 0.10
python scripts/collect.py fetch
python scripts/prepare.py
```

Collection requires private raw responses and the ledger in `.private`; the published repository does not contain them. Preparing photo jobs also needs Pillow (`python -m pip install Pillow`) and `python scripts/prepare.py --photos`. Luna review outputs are input-hash-bound JSON files in `.private/enrichment`; unsupported citations are rejected and recorded in `.private/validation-errors.json`. Refreshing the source facts invalidates stale analysis rather than silently retaining it.

## Publication

`npm run build` uses an explicit artifact allowlist: client bundles, favicon, curated `search.json`, matching listing details and `.nojekyll`. It checks price context, IDs, photo domains, forbidden personal fields, credentials, base paths and compressed data size.

`node scripts/stage-release.mjs` stages only source files, tests, workflow configuration and those verified public data files into `.private/pages-release`. It does not copy private raw responses, review text files, analysis images, credentials or browser records. The active Pages publishing source is the prebuilt `gh-pages` branch. GitHub's standard Pages deployment succeeded; the custom Actions build was refused because of an account billing lock. The custom workflow is available for manual use after that lock is cleared, and does not run automatically on source updates.

For a release, run the local tests and build, stage the source with `node scripts/stage-release.mjs`, and commit/push that source checkout. Copy only the verified `dist` allowlist into the separate static checkout at `.private/pages-static`, then commit/push its `gh-pages` branch. GitHub rebuilds the Pages site from that branch. Keep the static checkout's `.git` directory intact; it is not part of the uploaded site.

Listing information and photos belong to the hosts and Airbnb. This is an independent search tool; it is not affiliated with Airbnb.
