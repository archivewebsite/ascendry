# Player Explorer and Calculators Implementation Plan

## 1. Shared API foundation

- Extend `src/lib/server/bconomy.ts` with authenticated user search, profile, user, inventory, pet/egg, stats, trophies, faction, listings, logs, game-state, game-values, and batched market helpers.
- Add tolerant response guards that retain raw objects and exact integer strings.
- Add player and calculator domain types in `src/lib/types.ts`.
- Add focused player API routes under `src/app/api/players` with numeric BcID and pagination validation.

## 2. Player Explorer

- Add `/players` and a `PlayerExplorer` client component.
- Implement BcID/name lookup, URL persistence, lazy tab queries, manual player refresh, cross-calculator links, filtering, summaries, tables, and raw JSON disclosures.
- Render overview, inventory, pets/eggs, farm, Relay, legacy generators, listings, activity, and internal data without writing player payloads to disk.
- Add responsive page-specific styles while reusing Ascendry UI primitives and tokens.

## 3. Ascension engine and page

- Add a versioned rank/ascension rules module using exact integer arithmetic, discounts, the free-first-ascension rule, target traversal, and max-affordable traversal.
- Add calculation unit tests and a local calculation route.
- Add BcID prefill and an Ascension page with auditable summaries and progression rows.
- Add Ascension Runway using item search and live market history/listings/volume/transactions, three sale strategies, fees, eligibility, and automatic Best Decision selection.

## 4. Boss engine and page

- Add a versioned 12-weapon dataset and boss-rule constants.
- Implement exact kill and max-bounty quantities, modifier separation, Buddy contribution, overkill, inventory use, and deterministic Any Weapon ranking.
- Reuse the recursive crafting/order-book optimizer for acquisition-cost modes.
- Add calculator API routes, unit tests, live active-boss support, custom HP, BcID prefill, and the separate Boss Damage page.

## 5. Integration and verification

- Add Players and Calculators navigation entries and update the keyboard shortcut guide where appropriate.
- Add reusable states/patterns to `/design-guide` only if new shared components are introduced.
- Run typecheck, lint, unit tests, build, and focused end-to-end coverage.
- Review changed UI files against the current Web Interface Guidelines and visually inspect desktop/mobile states.
