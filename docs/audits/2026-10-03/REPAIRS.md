**Ascendry repairs — 3 October 2026 (Asia/Singapore)**

All 23 confirmed application findings from the [original audit](AUDIT.md) have been addressed. The Next.js dependency advisory has also been resolved by installing Next.js and eslint-config-next 16.3.6. Your saved database and protected credential were not used or changed during verification.

| Finding | Repair |
| --- | --- |
| F01 | Backup schemas validate nested plan JSON, exact numeric strings, timestamps, row identities, and alert trigger fields before opening the write transaction. Invalid imports leave existing data intact. |
| F02 | Latest prices and history use chronological timestamp ordering. New timestamps are canonical ISO strings; equivalent numeric/ISO timestamps deduplicate, including against legacy millisecond rows. Older refreshes cannot trigger alerts as the current market. |
| F04 | POST, PUT, and database plan writes use shared request/result schemas, including nested fields and matching item, quantity, recipe mode, and price mode. Invalid updates preserve valid plans. |
| F05 | Incomplete optimized lowest-price plans report an unavailable recommendation, zero fulfilled output, and the requested quantity unfilled. |
| F06 | Shopping-list fulfillment describes the selected cost model. A priced lowest-listing row no longer reports an order-book shortage. |
| F07 | Tracker restoration validates snapshot integers, inventory, stats, trophies, dates, and nested quotes. Broken entries are rejected independently; missing legacy numeric fields receive safe defaults. |
| F08 | Restricted craft steps are ordered by dependencies before being displayed. The regression checks every craftable catalog target, including the 17 previously invalid sequences. |
| F09 | Monitoring, duplicate checks, persisted profiles, and query keys use canonical safe BcIDs. Leading-zero IDs survive reload and cannot duplicate the same player. |
| F10 | Quantity expressions reject malformed comma grouping before removing separators. Valid grouped quantities and exact rational arithmetic remain supported. |
| F11 | Item-history days must be whole numbers from 1 to 400. Invalid input returns HTTP 400 before any upstream call. |
| F12 | Boss inventory lookups share the positive safe-integer BcID validator. Oversized IDs are rejected before conversion or account lookup. |
| F13 | Optional live boss references preserve local weapons when upstream requests fail. Base-price calculations can use explicitly labeled default constants offline. Requested inventory and live acquisition prices still require successful upstream data. |
| F14 | Changing an alert's item, direction, or threshold clears the old condition's trigger timestamp and price. |
| F15 | Restored Prestige IDs are unique; invalid/duplicate entries cannot make updates or deletions affect multiple profiles. Mutations require an existing identity and retain the last-profile guard. |
| F16 | Dangling snapshot references and duplicate backup identities are rejected explicitly rather than silently dropping price rows. |
| F17/F20 | Shared mutation checks enforce a matching local HTTP Host and Origin, reject cross-site fetches and non-loopback hosts, and require application/json for JSON endpoints. All current API writes are covered. The Host comparison accommodates Next's internal request URL and does not trust forwarded hosts. |
| F18 | Editable missing-price IDs persist separately from current calculated totals. Fields survive typing and recalculation; clearing an override restores market pricing. |
| F21 | Disconnect, history deletion, backup import, plan deletion, duplication, and recalculation check HTTP success and display errors. Pending operations are disabled; a new operation's error replaces the earlier error. |
| F22 | Manual and sale prices accept exact nonnegative expressions, including zero. Quantities and budgets retain positive constraints. Invalid expressions return HTTP 400; invalid schemas return HTTP 422. |
| F23 | Appearance and sidebar reads fall back when storage is denied. Failed writes retain in-memory state and show unsaved-change messages. Tracker and Prestige persistence failures no longer crash the application or claim a successful save. |
| F24 | Blank profile names are rejected before saving. Restoration recovers independent valid profiles instead of replacing the collection when one entry is invalid. |
| F25 | Order-book caches and manual overrides are checked before loading a credential. Fully manual or fully cached plans require no credential decryption. Needed live listings share a single deferred key lookup. |
| F26 | Craft Lab exports the versioned Plans format. Plans import also accepts the earlier `{ request, result }` Craft Lab files. Shared validation checks all incoming records before saving. |

The dependency update addresses [vendor advisory GHSA-vcvr-r3jv-pc5j](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j). npm reported **zero vulnerabilities** after installation. Both package.json and package-lock.json record the patched version.

**Verification**

| Check | Final result |
| --- | --- |
| Unit/integration tests | 116 passed across 18 files, including 28 audit regression checks |
| Existing browser suite | 8 passed |
| Repair browser/HTTP suite | 12 passed |
| TypeScript | Passed |
| Project and audit-artifact ESLint | Passed |
| Production build | Passed on Next.js 16.3.6 |

The original forensic checks were converted to desired-behavior regression tests and expanded to cover invalid updates, atomic backup rejection, cached calculations, offline reference fallback, storage denial, failed UI operations, canonical monitored IDs, and an actual downloaded plan round trip. The unit regressions are included in the normal `npm test` suite. The stale Settings-copy browser assertion was also corrected.

Browser verification used a separate production output directory and fresh temporary SQLite databases. Temporary databases were removed and test servers stopped. Next's audit-specific edits to tsconfig.json and next-env.d.ts were restored afterward.

Detailed browser results: [existing suite](repair-browser-baseline.json), [repair regressions](repair-browser-regressions.json).

Run the unit checks with `npm test`, or only the audit regressions with `node node_modules/vitest/vitest.mjs run --config docs/audits/2026-10-03/vitest.config.ts`. The already-built isolated browser checks run with `node docs/audits/2026-10-03/run-browser-audit.mjs`. After future code changes, rebuild with ASCENDRY_NEXT_DIST_DIR set to `.next-audit-build` before using that browser runner.

Live account-specific behavior and current in-game constants remain outside this mocked-data verification. The source-based risks and limitations listed separately in the original audit were not promoted to confirmed findings or silently marked repaired. Existing user data was not automatically rewritten or discarded.
