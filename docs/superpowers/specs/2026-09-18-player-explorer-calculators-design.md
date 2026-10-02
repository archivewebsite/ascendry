# Player Explorer and Calculators Design

Date: 2026-09-18

## Objective

Extend Ascendry with three independent, bookmarkable pages backed by a shared, server-only Bconomy API client:

1. A read-only Player Explorer for any BcID.
2. An Ascension Calculator with target and maximum-affordable modes plus market-funding recommendations.
3. A Boss Damage Calculator that computes weapon quantities and the lowest complete acquisition cost.

The Buildings Calculator is explicitly out of scope.

## Product boundaries

- The application remains local-only and binds to `127.0.0.1`.
- The Bconomy API key remains protected with Windows DPAPI, is decrypted only inside the server process for an upstream request, and is never returned to the browser or included in logs and error messages.
- All Bconomy operations are read-only. Ascendry may recommend market listings but never creates, edits, or removes an in-game listing.
- Player payloads are held only in browser/server memory for the current session. They are not written to SQLite, application data files, backups, or analytics.
- There is no polling, timed refresh, focus-triggered refresh, or automatic background refresh. Data changes only when first loaded or when the user presses a refresh button.
- The Player Explorer intentionally exposes all fields returned by the selected Bconomy user endpoints, including internal fields. The API key, local credentials, request headers, and other local secrets are not part of the player payload and are never displayed.
- Unknown future API fields must remain available in the Internal Data raw view because the Data API is unversioned.

## Information architecture

### Navigation

The main sidebar adds:

- **Players** → `/players`
- **Calculators**
  - **Ascension** → `/calculators/ascension`
  - **Boss Damage** → `/calculators/boss-damage`

No Buildings Calculator entry or route is added.

### Shared BcID context

- Player Explorer accepts a numeric BcID and player-name search.
- Search results always display the BcID so duplicate names can be distinguished.
- A selected player is represented in URLs as `?bcId=<integer>`.
- Player Explorer provides **Open in Ascension** and **Open in Boss Damage** links that preserve the selected BcID.
- Both calculators work without a BcID and keep every prefilled value editable.
- Entering an invalid, missing, or unknown BcID produces an explicit empty/error state rather than silently using another player.

## Shared server architecture

### Bconomy client

Extend the existing `src/lib/server/bconomy.ts` client rather than creating page-specific fetch implementations.

Responsibilities:

- Reuse the existing request queue, timeout, retry, and API-error normalization.
- Add canonical namespaced requests for user search, profile, user state, inventory, pets and eggs, stats, trophies, user listings, faction details, paginated logs, live game state, and live game values.
- Enforce the documented 120-request-per-minute limit conservatively through bounded concurrency and request deduplication.
- Parse integers that may exceed `Number.MAX_SAFE_INTEGER` as decimal strings.
- Validate known fields while retaining the original raw payload for the Internal Data view.
- Never log payload headers or the decrypted credential.

### Local API routes

Expose focused local routes rather than a single unrestricted proxy:

- `GET /api/players/search?q=`
- `GET /api/players/[bcId]/overview`
- `GET /api/players/[bcId]/inventory`
- `GET /api/players/[bcId]/pets`
- `GET /api/players/[bcId]/listings`
- `GET /api/players/[bcId]/activity?page=&pageSize=`
- `GET /api/players/[bcId]/internal`
- Calculator-specific read-only routes for boss state, calculations, ascension calculations, and sale recommendations.

Local routes validate query parameters and return stable Ascendry response envelopes. They do not accept an upstream endpoint name from the browser.

### Manual-refresh data policy

- The first visit to a player tab fetches that tab's required endpoint set.
- React Query retains the result for the current browser session with automatic refetch behaviors disabled.
- **Refresh Player** refreshes overview plus every tab that has already been opened. Unopened tabs remain unloaded until visited.
- A tab-level retry may refetch only a failed tab.
- Refreshing Activity resets it to page one.
- Each panel displays its own upstream retrieval timestamp and whether it is currently loading or failed.
- Closing/restarting the application discards all Player Explorer data.

## Player Explorer

### Page shell

The player header shows the player's name, BcID, profile type, tier, rank, BC balance, registration date, faction, Buddy, premium state when present, and retrieval timestamp. It also contains **Refresh Player**, **Open in Ascension**, and **Open in Boss Damage** actions.

The page uses the following tabs.

### Overview

Sources: `user/profile`, `user/get`, `stats/user`, `stats/trophies`, and `factions/get` when a faction exists.

Display:

- General identity, progression, currencies, faction, Buddy, quest progress, daily streak, roles, displayed statistic, and leaderboard positions.
- Prestige perk levels and their gameplay effects.
- Active effects/boosts with multiplier, action, and expiration.
- Cooldowns rendered as ready, remaining duration, or timestamp.
- Equipped items, augments, reserves, and major lifetime statistics.
- Trophy record and profile customization.

### Inventory

Source: `user/inventory`, joined to the synchronized item catalog and current local market snapshot.

Display and controls:

- Search, category and attribute filters, sorting, pagination/virtualization, and aggregate base/market value.
- Item image/emoji, name, ID, quantity, base value, estimated market value, craftability, Mercantilist requirement, and reserved/autosell amounts.
- Links to the existing Ascendry item detail page.
- Values with no current market price remain explicitly unpriced.

### Pets & Eggs

Source: `pets/userPetsAndEggs` plus item lookups for held items and cravings.

Display and controls:

- Search and filters for species, tier, skin, aura, adventure assignment, pinned state, and boost state.
- Pet ID, name, owner, hatch date, tier, XP, generation, parents, breeding information, energy, adventure, boost, lifetime items, craving, held item, skin, and aura.
- Egg ID, parents, and parent-held items.
- Parent references link to pet details where the API exposes them.

### Farm

Source: `user/get.farmPlots`.

Display:

- Summary counts by level, planted/empty state, and paid/extra status.
- Every plot's index, level, planted item, planting time, derived harvest status when item growth metadata permits it, multiplier, boost expiration, and `isExtra` flag.
- Search and filters for crop, level, planted state, boost state, and extra status.
- Large farms use virtualization or pagination.

### Relay

Source: `user/get.relay`, joined to live game values for human-readable labels where possible.

Display:

- Bay order, Salvage, active anchor, store/coolant state, automation, and research-cost tracking.
- Every bay family, mode, state, module count, extra count, modules, levels, upgrades, heat, coolant, overclock, buffers, overdrive, transmutation state, and family-specific fields.
- Full research tree state, including current Transmutation Queue data.
- Unknown family or module fields remain visible instead of being discarded.
- Large module collections are summarized by level/state with an expandable exact list.

### Legacy Generators

Source: `user/get.generators` and `relayNetworkReleaseDate`.

Display:

- Generator count, level distribution, extra status, and migration status.
- The section is labeled legacy and never presented as the current Relay system.
- Users who have migrated may still have retained records; both retained legacy data and live Relay data are shown as returned.

### Listings

Source: `market/userListings`.

Display:

- Every active listing with item, quantity, unit price, total value, listing age when available, current lowest ask, difference from market, and estimated net proceeds using the player's Insider level.
- Sorting and filtering by item, price, total value, and market position.
- This view is informational and has no mutation controls.

### Activity

Source: paginated `logs/byBcId`.

Display:

- Chronological entries with resolved player, faction, pet, item, listing, amount, and special references.
- Filters for log type, date, items, market, boss, pets, factions, progression, and rewards.
- Pagination respects upstream non-moderator page limits.
- Raw per-entry data remains expandable.

### Internal Data

Sources: the complete raw payloads already retrieved for the player.

Display:

- Structured sections for settings, custom profile fields, blocked BcIDs, moderation/account fields, Discord identifiers and server IDs, internal state, cooldowns, pins, categories, reserves, autosell configuration, depot, Pyre, Relay internals, and unknown fields.
- A searchable, collapsible raw JSON viewer for each endpoint.
- Copy controls operate locally in the browser.
- No value returned in the player payload is redacted. Local API keys, DPAPI ciphertext, request headers, filesystem paths, and server diagnostics are not player fields and are never included.

## Ascension Calculator

### Inputs and profile prefill

- Optional BcID.
- Current tier and rank.
- Current BC balance.
- Nepotism, Anointment, Mercantilist, and Insider levels.
- Calculation mode: **Target** or **Max Affordable**.
- Target tier and rank in Target mode.
- Available BC in Max Affordable mode.
- Every prefilled field remains manually editable without mutating the player account.

### Versioned progression rules

- Progression calculations use a versioned local rule module with source notes and an effective date.
- The current free-first-ascension exception is represented explicitly.
- Nepotism reduces rank costs by 2.5 percentage points per level.
- Anointment reduces ascension costs by 2.5 percentage points per level.
- Reductions are applied at the same per-step rounding boundary used by the game.
- Rank and ascension costs remain exact decimal integers.
- The UI displays the active rule version and does not claim an old third-party calculator is authoritative.

### Target mode

- Reject a target earlier than the current position.
- Sum every rank-up from the current rank to God, each required ascension, each full intermediate rank cycle, and the final target tier's ranks.
- Return separate rank, ascension, discount, and grand totals.
- Return a step-by-step expandable progression ledger.
- Compare the grand total with the current/manual BC balance and calculate the funding gap or remaining balance.

### Max Affordable mode

- Advance through rank and ascension steps in order until the next step exceeds the supplied balance.
- Return the final tier/rank, spent BC, remaining BC, next step and next-step shortfall.
- Use exact arithmetic and a bounded algorithm suitable for large tiers and balances.

### Ascension Runway

Ascension Runway appears when a target has a funding gap and may also be opened manually.

Inputs:

- One or more searchable items.
- Quantity proposed for sale per item.
- Optional BcID inventory quantities as guidance. Manual quantities remain allowed and are visibly marked when they exceed loaded inventory.
- The current player's Mercantilist and Insider levels, or manual levels.

Market inputs per item:

- Current active listings/order book.
- Last five recent transactions.
- Price history.
- Daily volume and revenue history.
- Base worth and live game-value listing limits/fees.

Strategies:

- **Quick Sale:** prioritizes current executable competition and recent realized prices.
- **Balanced:** robustly blends the current lowest ask, recent transaction median, seven-day volume-weighted price, and longer price history.
- **Patient Sale:** targets the upper recent trading range and carries a slower-sale/low-liquidity warning.

Best Decision is selected automatically:

1. Choose Quick Sale when its estimated net proceeds cover the gap with adequate market evidence.
2. Otherwise choose Balanced when it covers the gap.
3. Otherwise choose Patient Sale when it covers the gap and its liquidity confidence is adequate.
4. If no strategy covers the gap, choose the most reliable estimate and report the remaining BC and additional quantity required.

Results include recommended unit price, quantity, gross proceeds, Insider-adjusted fee, net proceeds, coverage/surplus/shortfall, Mercantilist eligibility, expected liquidity, confidence, evidence, and retrieval timestamps. Recommendations never create a listing.

## Boss Damage Calculator

### Weapon data

The versioned weapon dataset contains all current weapon items and exact base damage:

| Weapon | Base damage |
| --- | ---: |
| Rusty Knife | 200 |
| Bomb | 20,000 |
| Broadsword | 311,550 |
| Poison Spear | 1,098,000 |
| Stun Gun | 6,658,500 |
| Knife Turret | 36,063,000 |
| Imbued Sword | 58,126,950 |
| Sinurator | 234,600,000 |
| Crystal Sword | 999,646,200 |
| Pocket Rocket | 1,355,031,000 |
| Little Brother | 15,308,000,000 |
| Low Orbit Ion Cannon | 183,396,069,000 |

Each entry links to the synchronized item record for base worth, recipe, market data, image, and inventory quantity.

### Inputs

- Optional BcID.
- Boss source: live active boss, known versioned catalog entry, or custom HP.
- Remaining HP as a plain non-negative integer.
- Weapon: a specific weapon or **Any weapon**.
- Mode: **Max Bounties** or **Kill Boss**.
- Pricing mode: **Buy from Market**, **Direct Recipe**, **Raw Materials**, or **Base Price**.
- Optional **Use owned inventory**, enabled by default when a BcID is loaded.
- Damage inputs for weakpoint, faction contribution/multiplier, and Buddy weapon contribution.

### Boss and modifier provenance

- `misc/gameState.activeBossStatus` is authoritative for the currently active boss's ID, initial health, damage dealt, remaining health, weakpoints, and attacker count.
- Known boss/miniboss records are versioned and labeled with their verification date.
- Historical or incomplete values are visibly labeled and never override live state.
- Custom remaining HP is always available because the API does not expose a complete static boss/miniboss catalog.
- Live game values provide the current weakpoint multiplier, standard-loot fraction, bounty cap, and related constants.

### Damage calculations

- All arithmetic is exact integer/rational arithmetic.
- Base attack damage is the sum of consumed weapon base damage.
- Effective damage applies the selected weakpoint and faction multipliers and adds Buddy weapon damage according to the current versioned rule.
- Buddy damage and combat multipliers are excluded from base bounty-credit damage.
- Kill quantity is the smallest whole weapon quantity whose effective damage is at least the entered remaining HP after any fixed Buddy contribution.
- Results show base damage, each modifier, effective damage, boss overkill, percent of boss health, and remaining HP after the attack.

### Max Bounties

- The live standard-loot fraction and maximum standard-loot cap determine the required unmodified base damage.
- Weapon quantity is the smallest whole quantity whose bounty-credit base damage reaches the cap.
- The result displays both bounty-credit damage and effective boss damage so multipliers cannot be mistaken for extra bounty eligibility.

### Pricing modes

- **Buy from Market:** consume active listings in ascending price order. The API exposes at most 50 listings; insufficient disclosed depth produces an incomplete result.
- **Direct Recipe:** craft the target weapon for the required quantity, respecting output yield and ceiling operations, and acquire immediate ingredients from disclosed market depth.
- **Raw Materials:** recursively expand craftable ingredients to terminal materials, aggregate shared requirements, respect yields and ceilings, and acquire terminal inputs from disclosed market depth.
- **Base Price:** multiply item base worth by required quantity without consulting market liquidity.
- Missing market prices/depth remain incomplete. They never silently fall back to base price.
- Recursive expansion detects recipe cycles and returns a clear error rather than looping.

### Any Weapon optimization

- Evaluate every weapon under the selected damage and pricing rules.
- Rank only complete results ahead of incomplete results.
- Primary ordering is lowest complete total acquisition cost.
- Ties use least overkill, then fewest consumed weapons, then deterministic weapon name order.
- When owned inventory is enabled, owned weapons and relevant ingredients reduce out-of-pocket acquisition requirements.
- Results separately display consumed owned value, additional cash cost, and full replacement value.
- The result list explains why each alternative ranks below the recommendation.

## Error handling

- Each Player Explorer tab and calculator market-data dependency has an independent loading/error boundary.
- Invalid inputs are rejected before upstream calls.
- Authentication errors instruct the user to reconnect the key in Settings without revealing it.
- Rate-limit responses disable refresh briefly and present a retry-after message when available.
- Network/server failures preserve the currently displayed in-memory result and label it with its original retrieval time.
- Schema mismatches preserve raw payload access while known-field panels show a compatibility warning.
- Refresh controls are disabled while their associated request is running.
- Empty collections use intentional empty states rather than errors.

## Accessibility and responsive behavior

- Every input has a visible label and validation message association.
- Tabs, dialogs, disclosures, tables, filters, and raw JSON controls are keyboard operable.
- Status and refresh results use appropriate live regions without excessive announcements.
- Meaning is not conveyed by color alone.
- Wide desktop tables become compact cards or horizontally contained tables on narrow screens without hiding fields.
- Large collections use pagination or virtualization without breaking focus order.
- Reduced-motion settings are respected.

## Verification strategy

### Unit coverage

- Decimal-string and `BigInt` parsing/formatting.
- Rank and ascension step costs, discounts, free-first-ascension behavior, target traversal, and max-affordable boundaries.
- Sale-price strategy statistics, fee calculation, Mercantilist eligibility, confidence, and Best Decision selection.
- Weapon quantities, modifier separation, bounty cap, overkill, and tie-breakers.
- Direct and recursive recipes, yields, shared inputs, cycles, owned inventory, market depth, and incomplete results.
- Player-field normalization and unknown-field preservation.

### Integration coverage

- Bconomy request mapping, retries, error redaction, namespaced types, and rate-limit behavior using mocked upstream responses.
- Local player routes compose the correct endpoints without accepting arbitrary proxy types.
- Manual refresh invalidates only the selected player and already opened tabs.
- Large integer payloads round-trip without precision loss.

### Component and end-to-end coverage

- Search/select a player, inspect every tab, reveal Internal Data, refresh manually, and navigate to both calculators.
- Manual and BcID-prefilled Ascension workflows, including Ascension Runway.
- Manual and BcID-prefilled Boss Damage workflows for a specific weapon and Any Weapon.
- Partial upstream failures, empty profiles, duplicate names, large farms/pet collections/module sets, and insufficient market depth.
- Keyboard navigation, mobile layouts, accessible labels, and focus behavior.

## Delivery sequence

1. Shared API schemas/client extensions and player routes.
2. Player Explorer with manual refresh and Internal Data.
3. Versioned progression rules and Ascension Calculator.
4. Ascension Runway market recommendation engine.
5. Versioned weapons/boss rules and Boss Damage Calculator.
6. Cross-page BcID handoff, navigation polish, and full verification.

## Completion criteria

- Any valid BcID can be searched or opened directly and every requested profile area renders from the Bconomy API.
- Internal fields and raw payloads are accessible without persisting player data or exposing the local API key.
- Player data refreshes only through explicit user action after its initial load.
- Ascension Target and Max Affordable calculations are exact and provide auditable breakdowns.
- Ascension Runway selects and explains Quick, Balanced, or Patient pricing using live market evidence.
- Boss Max Bounties and Kill Boss modes return exact weapon quantities.
- Any Weapon selects the lowest complete cost under all four pricing modes and handles recursive recipes and market depth correctly.
- All new pages are accessible, responsive, resilient to partial API failures, and integrated with existing Ascendry navigation and visual language.
