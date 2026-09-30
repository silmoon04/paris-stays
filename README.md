# Paris Stays

[Open the search](https://silmoon04.github.io/paris-stays/).

A separate Roomway-style search for one entire Paris home, 31 October–4 November 2026, five adults, four proper beds and a £2,500 whole-stay budget. The approximate areas cover Louvre–Tuileries–Palais Royal–Opéra and Châtelet–Les Halles–Pompidou.

The app keeps WCs separate from bathing rooms, excludes sofa beds from proper-bed counts, distinguishes evidence from missing information, and includes unknowns in filters by default. Two WCs qualify; three rank higher. Listings with known core mismatches are hidden by default and can be inspected through the filter controls.

The vector map uses OpenFreeMap/MapLibre, with an attributed OpenStreetMap fallback. Prices are four-night GBP quotes. Locations and Louvre walking times are approximate. Hover previews, coordinated map/list selection, photo shortcuts, comparison of three homes and a mobile results sheet make the shortlist easier to assess.

## Snapshot and its limits

The September 2026 collection has 520 discovery rows, 346 unique listings and 135 within the two approximate areas. These counts describe this collection, not complete market coverage. Geographic URL searches returned broader Paris results, so area membership is checked against returned coordinates.

GPT-6 Luna workers structured 75 candidates and inspected photos for 43 homes. Ten leading candidates received closer review using full-resolution images. Every retained fact includes a source, evidence, confidence and review time. Photo counts are minimum observations; repeated views do not establish additional beds or WCs. Photos cannot prove measured floor area, current cleanliness or a complete stair-free route.

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

`node scripts/stage-release.mjs` stages only source files, tests, workflow configuration and those verified public data files into `.private/pages-release`. It does not copy private raw responses, review text files, analysis images, credentials or browser records. The GitHub Pages workflow tests and verifies the static artifact before deployment.

Listing information and photos belong to the hosts and Airbnb. This is an independent search tool; it is not affiliated with Airbnb.
