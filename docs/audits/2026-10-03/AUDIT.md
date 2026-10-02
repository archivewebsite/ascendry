**Ascendry project audit — 3 October 2026 (Asia/Singapore)**

This is the historical report from before repairs. All 23 confirmed application findings and the dependency advisory were subsequently addressed; see [repairs and final verification](REPAIRS.md). The original forensic test files now assert the repaired behavior.

The review found **23 confirmed application findings**, plus one dependency advisory. Six application findings deserve priority because they can corrupt persisted state, lose profile data, accept cross-origin writes, or block a core editing flow. The application source was reviewed without applying fixes. The report and isolated reproduction tools are the deliverables.

The review covered the application routes and components, exact-integer utilities, crafting and optimization engines, calculators, local SQLite persistence, credential handling, browser persistence, project configuration, scripts, and existing tests. Runtime experiments used fresh temporary databases and mock credentials. Your `data/` database and credential were not used in the experiments. The checkout has no Git metadata, so commit history and a Git diff were unavailable.

| Check | Result |
| --- | --- |
| TypeScript, including the audit artifacts | Passed |
| Project ESLint | Passed |
| Audit artifact ESLint | Passed |
| Existing unit/integration suite | 88 passed across 17 files |
| Production build | Passed using a separate `.next-audit-build` directory |
| Existing browser suite on a clean database | 6 passed, 2 failed |
| Additional forensic checks | 20 unit/route checks and 8 browser/HTTP checks passed |
| npm advisory query, after explicit approval | One critical-severity package advisory; affected feature not used by the project |

The forensic checks deliberately assert the observed defects so another reviewer can reproduce them. Their passing status means the failure behavior was reproduced; it does **not** mean the application has been repaired. Three of these checks are controls that rule out suspected defects. Finding IDs have gaps because discarded hypotheses and controls keep their original identifiers.

**Priority findings**

1. **[P1 · F01] Backup import can commit data that makes ordinary reads fail.**
   Location: [db.ts:247](../../../src/lib/server/db.ts#L247), [db.ts:221](../../../src/lib/server/db.ts#L221).
   Only `schemaVersion` is validated. A plan row with `payload_json: "{"` imports successfully, then every `listPlans()` call throws `SyntaxError`. A snapshot with `upstream_updated_at: "invalid-time"` also imports successfully, then `getCatalog()` throws `RangeError`. These values survive a process restart; a transaction alone does not prevent them because their SQL field types are valid. Validate complete backup structures, nested plan JSON, exact numeric strings, timestamps, and relationships before beginning the transaction. Reject the entire invalid backup without changing existing data.

2. **[P1 · F02] An older snapshot can replace newer market prices.**
   Location: [db.ts:174](../../../src/lib/server/db.ts#L174), [db.ts:189](../../../src/lib/server/db.ts#L189).
   The latest preview is chosen by the largest local insertion ID. Storing 2 October at 100 BC, then 1 October at 25 BC, makes the catalog show 25 BC. Importing an older backup or receiving out-of-order refresh responses can cause this without malformed data. Local history is likewise returned in insertion order rather than timestamp order. Normalize upstream timestamps and use chronological ordering for current prices and history. Handle equivalent ISO and numeric timestamp representations consistently.

3. **[P1 · F04] Plan endpoints persist structurally empty plans that the UI cannot render.**
   Location: [plans/route.ts:8](../../../src/app/api/plans/route.ts#L8), [plans/[id]/route.ts:8](../../../src/app/api/plans/[id]/route.ts#L8), [PlansWorkspace.tsx:26](../../../src/components/plans/PlansWorkspace.tsx#L26).
   Posting `{ name: "Invalid", payload: {}, result: {} }` returns 201 and writes a row. The Plans UI later dereferences `payload.profile.name` and `result.target.name`, causing a render fault. The `as never` cast suppresses the compile-time warning without supplying runtime validation. Use shared schemas for the saved request and result, and enforce their required fields and integer constraints on POST, PUT, and import. Do not recompute historical plans merely to validate their shape.

4. **[P1 · F17/F20] The local API accepts writes carrying a foreign Origin.**
   Location: [plans/route.ts:8](../../../src/app/api/plans/route.ts#L8), [backup/route.ts:6](../../../src/app/api/backup/route.ts#L6).
   An actual HTTP POST with `Origin: https://foreign.example` and `Content-Type: text/plain` creates a persistent plan. The handler calls `request.json()` regardless of media type and has no origin check. No project middleware or proxy supplies a shared origin guard. This confirms missing server protection; a browser attack's reachability also depends on that browser's local-network permission policy, and was not established by the HTTP client test. Binding to loopback alone does not validate the caller's origin. Add a centralized same-origin check for browser mutations, reject unexpected content types on JSON endpoints, and cover the backup, connection, history, alert, and plan routes consistently.

5. **[P1 · F18] Manual-price controls disappear as soon as they are edited.**
   Location: [CraftLab.tsx:32](../../../src/components/craft/CraftLab.tsx#L32), [CraftLab.tsx:52](../../../src/components/craft/CraftLab.tsx#L52).
   Calculate an unpriced direct Bricks recipe, then enter the first character in a manual-price field. Editing `overrides` changes `inputKey`; `currentCalculation` and `result` become undefined, and the controls rendered from `result.missingPrices` unmount. Browser automation confirmed that all manual-price fields disappear after the first edit. Keep the editable missing-price identifiers independently of whether the displayed calculation is current. Retain entered values and a way to remove overrides; stale calculated totals can remain hidden.

6. **[P1 · F24] Saving a blank Prestige profile name resets saved levels after reload.**
   Location: [prestige-profiles.ts:38](../../../src/lib/client/prestige-profiles.ts#L38), [prestige-profiles.ts:17](../../../src/lib/client/prestige-profiles.ts#L17).
   Set Insider to 5, clear the profile name, and click Save profile. The UI reports success. After reload, Insider becomes 0 because save validates only levels while restore rejects the blank name and replaces the entire profile collection with a default. A single invalid entry can discard otherwise valid profiles as well. Validate trimmed names before saving, and recover valid entries independently during restoration. Avoid overwriting recoverable storage with defaults.

**Other confirmed findings**

7. **[P2 · F05] Incomplete optimized lowest-price plans claim full fulfillment.**
   Location: [crafting.ts:220](../../../src/lib/crafting.ts#L220).
   A target and raw ingredient with no usable prices produce `complete: false` together with `fulfilledQuantity: "1"`, `unfilledQuantity: "0"`, and the recommendation `Buy 1`. Recommendation and fulfillment fields currently depend on the tree action and requested quantity, not whether a priced path exists. Return an unavailable recommendation and conservative fulfillment information when the chosen path is incomplete. Keep the semantics consistent with the order-book optimizer.

8. **[P2 · F06] Lowest-price shopping lists display false supply shortfalls.**
   Location: [crafting.ts:130](../../../src/lib/crafting.ts#L130), [crafting.ts:168](../../../src/lib/crafting.ts#L168).
   A direct plan needing three raw units at a known price is complete in lowest-price mode, but its shopping row reports zero filled and three unfilled when no order book was loaded. The UI prints this as an unfilled warning even though the selected model assumes the known unit price. Represent the selected model's availability consistently, or label unused order-book depth as unknown rather than a demonstrated shortage.

9. **[P2 · F07] Tracker restoration accepts values that crash integer rendering.**
   Location: [restricted-tracker.ts:54](../../../src/lib/restricted-tracker.ts#L54), [RestrictedTracker.tsx:25](../../../src/components/tracker/RestrictedTracker.tsx#L25).
   A stored snapshot with `tier: "not-a-number"`, otherwise satisfying the shallow checks, is retained. Rendering then passes that value to `BigInt` and throws. Required numeric fields can also be absent; stats, previous snapshots, and Depot quote entries are not fully checked. Normalize or reject the exact fields consumed by the UI instead of trusting the TypeScript cast. Preserve independently valid profiles when one entry is damaged.

10. **[P2 · F08] Reversing craft discovery order does not produce a valid craft sequence.**
    Location: [restricted-tracker.ts:116](../../../src/lib/restricted-tracker.ts#L116), [RestrictedTracker.tsx:144](../../../src/components/tracker/RestrictedTracker.tsx#L144).
    A recipe needing both Bar and Plate, where Plate itself needs Bar, yields the displayed order Plate → Bar → Machine. A real-catalog reproduction found invalid prerequisite ordering for **17 of 65** craftable targets with empty inventory, including Solar Panel, Stun Gun, Pocket Rocket, and Nuclear Reactor. Consolidating counts in a Map preserves first discovery order, which is not a dependency ordering. Sort the actual required craft steps topologically so each crafted prerequisite appears before every consumer.

11. **[P2 · F09] Leading-zero BcIDs can duplicate tracked profiles and disappear after reload.**
    Location: [RestrictedTracker.tsx:58](../../../src/components/tracker/RestrictedTracker.tsx#L58), [restricted-tracker.ts:62](../../../src/lib/restricted-tracker.ts#L62).
    The monitor stores the typed ID `"001"`; the server canonicalizes it to snapshot ID `"1"`. The restoration code rejects the mismatch, while duplicate checks compare the unnormalized input and let `"1"` and `"001"` represent the same player twice. Canonicalize once before checking duplicates, fetching, storing, and constructing query keys. Restore using the same canonical form.

12. **[P2 · F10] Invalid comma grouping silently changes quantities.**
    Location: [quantity.ts:29](../../../src/lib/quantity.ts#L29).
    `parseQuantityExpression("1,,0")` returns 10 and `"1,2"` returns 12. The token regex accepts arbitrary commas and strips them, allowing typing mistakes to become a different valid amount. The booster parser already rejects malformed grouping, so the calculators are inconsistent. Validate conventional thousands groups before stripping separators, while preserving exact rational arithmetic and legitimate expressions.

13. **[P2 · F11] Item history requests forward fractional days and NaN.**
    Location: [items/[idName]/market/route.ts:16](../../../src/app/api/items/[idName]/market/route.ts#L16).
    `days=1.5` reaches the upstream price-history call as 1.5; `days=abc` reaches it as NaN, which JSON serialization changes to null. `Math.min`/`Math.max` do not validate finite whole numbers. Validate a whole number within the supported range before constructing cache keys or making requests, and return a client error for invalid input. The official API specifies integer day filters. [Bconomy Data API](https://bconomy.wiki.gg/wiki/Data_API).

14. **[P2 · F12] Boss inventory lookup rounds oversized BcIDs to a different player.**
    Location: [boss-damage/route.ts:24](../../../src/app/api/calculators/boss-damage/route.ts#L24), [boss-damage/route.ts:71](../../../src/app/api/calculators/boss-damage/route.ts#L71).
    The request accepts any digit string and converts it with `Number()`. Input `9007199254740993` is passed upstream as `9007199254740992`. Regular player routes already reject this through `parseBcId`. Reuse the positive safe-integer validator before applying a player's inventory; also reject zero here.

15. **[P2 · F13] Local base-price boss calculations fail if a saved key exists and the network fails.**
    Location: [boss-damage/route.ts:51](../../../src/app/api/calculators/boss-damage/route.ts#L51), [boss-damage/route.ts:65](../../../src/app/api/calculators/boss-damage/route.ts#L65).
    With no key, a base-price calculation works locally. With a readable saved key, it unconditionally fetches game values, so an offline or rejected-key error makes the same calculation fail. The reference GET similarly discards its already-built weapon list if optional live data fails. Keep local reference/base pricing available and clearly identify fallback constants when live values cannot load. Inventory and market pricing should still require successful live requests.

16. **[P2 · F14] Editing an alert retains a trigger belonging to the old condition.**
    Location: [db.ts:233](../../../src/lib/server/db.ts#L233).
    Trigger a Rock-below-30 alert at 25, then update it to Iron-above-50000. The row retains `triggeredPrice: "25"` and its old trigger timestamp. The dashboard now presents the Iron condition as having fired. Clear or reevaluate the trigger when the item, direction, or threshold changes; distinguish historical trigger records if they are intentionally retained.

17. **[P2 · F15] Duplicate Prestige IDs are accepted on restoration.**
    Location: [prestige-profiles.ts:14](../../../src/lib/client/prestige-profiles.ts#L14), [prestige-profiles.ts:38](../../../src/lib/client/prestige-profiles.ts#L38).
    Stored profiles with the same ID are both returned. Selection becomes ambiguous and saving one updates both entries because update matches every equal ID. Delete can likewise remove multiple profiles despite the last-profile guard. Ensure restored IDs are unique and validate profile identity on every mutation. Recover independent valid entries instead of replacing the entire collection.

18. **[P2 · F16] Backup import silently drops prices with unresolved snapshot references.**
    Location: [db.ts:256](../../../src/lib/server/db.ts#L256).
    A backup price referencing snapshot 999, with no corresponding snapshot entry, is ignored. Import reports success while the price data is lost. Validate referential completeness up front and reject dangling references, or explicitly resolve references against existing snapshots if partial imports are a supported format. Do not silently skip rows.

19. **[P2 · F21] Failed data operations are not surfaced reliably.**
    Location: [SettingsWorkspace.tsx:19](../../../src/components/settings/SettingsWorkspace.tsx#L19), [PlansWorkspace.tsx:18](../../../src/components/plans/PlansWorkspace.tsx#L18).
    A mocked disconnect HTTP 500 is treated by the mutation as success, and no credential-removal error is displayed. Settings history deletion and Plans deletion also treat any HTTP response as success. Settings import, plan duplication, and recalculation can throw into ignored promises without presenting an error. Check `response.ok`, propagate the returned error, and render operation errors and pending states. This finding's browser reproduction covers disconnect; the other paths were verified by source inspection.

20. **[P2 · F22] Zero-price handling is inconsistent between the API and engines.**
    Location: [craft/calculate/route.ts:48](../../../src/app/api/craft/calculate/route.ts#L48), [optimized-crafting.ts:232](../../../src/lib/server/optimized-crafting.ts#L232).
    The engines support zero manual prices and explicitly detect unlimited free budget paths. The request endpoint uses the positive-quantity parser for prices, so a zero override fails with HTTP 500 before the engine can handle it. Make the intended price policy explicit: use nonnegative price parsing if zero represents already-owned/free inputs, or consistently reject it in public engine interfaces. Quantities and budgets should keep their separate positive constraints. User validation errors should return a client status rather than 500.

21. **[P2 · F23] Unavailable localStorage crashes the shared application providers.**
    Location: [AppearanceProvider.tsx:21](../../../src/components/appearance/AppearanceProvider.tsx#L21), [AppShell.tsx:26](../../../src/components/shell/AppShell.tsx#L26).
    Browser automation replaced storage reads with a `SecurityError` to model denied browser storage. Opening the dashboard raises a page error and removes the Control bench view. Appearance and shell storage access are unguarded; tracker and Prestige writes can also throw. Handle unavailable storage with in-memory defaults, keep the application usable, and report unsaved changes when persistence fails rather than claiming they were saved.

22. **[P2 · F25] Fully manual order-book plans unnecessarily depend on credential decryption.**
    Location: [craft/calculate/route.ts:57](../../../src/app/api/craft/calculate/route.ts#L57).
    Supply manual prices for every direct Bricks ingredient, choose order-book mode, and make `loadApiKey()` reject. The endpoint returns 500 even though none of its selected purchases needs a live listing. It loads the credential before filtering overridden items or determining which cached books are sufficient. Only require/decrypt a key when an uncached, non-overridden book must be fetched. This also applies to an otherwise usable cached scenario.

23. **[P2 · F26] Craft Lab JSON exports do not round-trip through Plans import.**
    Location: [CraftLab.tsx:65](../../../src/components/craft/CraftLab.tsx#L65), [PlansWorkspace.tsx:22](../../../src/components/plans/PlansWorkspace.tsx#L22).
    Craft Lab downloads `{ request, result }` as `ascendry-plan.json`. Plans import expects `{ name, payload, result }`, or an array of those records. A file matching the actual Craft Lab export produces “Plan could not be imported.” Browser automation reproduced this with a valid calculated result. Use a shared versioned export format, or explicitly accept and convert the Craft Lab shape before saving it.

**Dependency advisory**

`npm audit` reports one critical-severity advisory for the installed Next.js **16.3.5**, affecting Node.js `next/og` ImageResponse when attacker-controlled values reach generated SVG content, attributes, or styles. The vendor lists **16.3.6** as patched. Source search found no `next/og`, `ImageResponse`, or dynamic Open Graph image route in this project; the advisory's documented vulnerable usage is therefore absent from the reviewed application. This is a dependency maintenance flag, not evidence that this application currently exposes remote code execution. Upgrade Next.js and its matching ESLint configuration deliberately, then rerun verification. [Vendor advisory GHSA-vcvr-r3jv-pc5j](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j).

The raw npm result is retained in [dependency-audit.json](dependency-audit.json). The query was initially blocked by automatic approval review because dependency metadata would be sent to npm. After you explicitly approved that transmission, the query succeeded; no dependency lookup remains blocked.

**Additional source-based risks and limits**

These were inspected but are not counted as reproduced bugs:

- **Credential test coverage:** [integration.test.ts:24](../../../src/lib/server/integration.test.ts#L24) treats the Windows “user profile loaded” error as a passing outcome and returns before the encrypt/decrypt assertions. The passing suite therefore does not by itself establish that a DPAPI round trip succeeded in this environment. No live credential was used.
- **Concurrent credential replacement:** [credential.ts:30](../../../src/lib/server/credential.ts#L30) uses a shared `credential.dpapi.tmp` path. Concurrent saves can overwrite or consume each other's temporary file. Use unique temporary names and defined replacement ordering. No live credential was used to exercise this race.
- **Browser-only data is omitted from server backups:** [db.ts:242](../../../src/lib/server/db.ts#L242) exports plans, alerts, snapshots, and prices. Prestige profiles and tracked snapshots/goals/Depot quotes live in localStorage and are omitted. A restored server backup cannot recover that state after browser storage is cleared. Document the backup boundary or extend a full-workspace export intentionally.
- **Query-parameter changes can retain old form state:** Craft Lab initializes item/sale-price state once; Ascension Calculator's prefill ref is never reset for a different BcID. If navigation keeps these components mounted while their query strings change, the URL can identify a different input from the form. Normal cross-page navigation remounts them; retained-component navigation was not separately reproduced.
- **Upstream rate limits:** the request queue limits concurrent calls, not requests per minute, and retries do not honor `Retry-After`. Large recipe graphs and multiple tabs can still exhaust a key's rate allowance. The public API describes a 120-request/minute limit, shared with other use of the same account/IP. No live flood test was performed. [Bconomy Data API](https://bconomy.wiki.gg/wiki/Data_API).
- **Game rule accuracy remains partly unverified:** rank prices, prestige unlocks/maxima, fee rounding, bounty rounding, and buddy stacking have internal tests, but those tests largely assert local constants. Current authoritative in-game rule content was not fully available through public documentation. No specific mismatch in these rules is claimed. Live account-specific payloads and upstream error behavior were exercised with fixtures/mocks rather than your account.

**Existing browser-test failures**

- The appearance/Prestige test expects the old text `Supply Depot pricing` on Settings. Current copy discusses the Profile tracker and manual Depot quotes. This is a stale test assertion, not a demonstrated application failure; its later dark-mode assertion is never reached.
- The crafting test changes from order-book mode to lowest-listing mode, then tries to edit missing-price controls before recalculating. Those controls have already disappeared with the stale result, so no usable overrides are applied and `Selected total` is never shown. F18 independently reproduces the underlying editing defect, without that test's mode-switch setup.

Detailed results are in [browser-baseline.json](browser-baseline.json) and [browser-reproductions.json](browser-reproductions.json).

**Reproduce this audit**

Run from `C:\Users\camar\Documents\Coding\ascendry`:

```powershell
node node_modules/vitest/vitest.mjs run --config docs/audits/2026-10-03/vitest.config.ts --reporter=verbose

# The browser runner uses the isolated production build and a fresh temporary database.
# An existing .next-audit-build from this audit is already available.
node docs/audits/2026-10-03/run-browser-audit.mjs

# Run only the additional browser reproductions.
node docs/audits/2026-10-03/run-browser-audit.mjs --reproductions-only
```

If rebuilding the isolated output later, set `ASCENDRY_NEXT_DIST_DIR` to `.next-audit-build` before invoking Next's build command. Next rewrites its generated type imports and adds that output directory to tsconfig includes; those audit-specific changes were reverted after this review. Temporary test databases were removed, and audit server processes were stopped. No packages were updated or vulnerabilities repaired.

Suggested repair order: validate backup and saved-plan boundaries; fix profile-name data loss and the missing-price editor; enforce mutation origins; correct snapshot chronology and craft ordering; then address availability reporting, numeric input validation, offline behavior, import compatibility, and operation errors. Convert the forensic checks into desired-behavior regression tests as each defect is repaired.
