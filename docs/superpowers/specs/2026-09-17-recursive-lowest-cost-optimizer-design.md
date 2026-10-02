# Recursive Lowest-Cost Optimizer

## Goal

Replace Ascendry's current per-node estimate with one quantity-aware optimizer that works for every craftable catalog item. For a requested output and quantity, it must decide how many units to buy and how many to craft at every reachable recipe level, including the output itself.

The objective is lexicographic:

1. Fulfil as much of the requested output as the known market depth and recipes allow.
2. Among equally complete plans, minimize total BC cost.

Money and quantities use exact integer arithmetic. Missing supply is never treated as free and market depth is never extrapolated beyond the returned listings.

## User-visible behavior

Craft Lab keeps three analysis modes:

- **Direct recipe:** show the immediate ingredients for crafting the requested output.
- **Craft all:** recursively craft every craftable intermediate and buy only raw requirements.
- **Lowest cost:** compare buying, crafting, and mixed quantities throughout the complete recipe graph.

Lowest cost is the default. Its result begins with a compact recommendation:

- `Best option: Buy`, `Best option: Craft`, or `Best option: Mix`.
- The selected total cost and exact market timestamp.
- Savings against buying everything and crafting everything when those comparisons are complete.
- A short explanation such as `Buy 6 and craft 14`.

The recipe circuit may show a split node, such as `Buy 6 · Craft 14`. The action table lists every purchase and craft step with its quantity, unit or known cost, price source, and any unfilled amount. The consolidated shopping list remains the final list of market purchases.

## Price behavior

- **Lowest listing** treats the latest preview price as an unlimited estimate. It produces a fast recursive comparison, but is explicitly labeled an estimate.
- **Order-book depth** is the authoritative quantity-aware recommendation. It consumes cached or freshly fetched listings cheapest-first for the output and every reachable recipe item.
- Manual price overrides are explicit unlimited custom prices for that plan and are labeled `Custom`.
- When the first 50 listings cannot cover a purchase, the optimizer may craft the remainder if that path can be fulfilled more cheaply or more completely.
- If neither market purchases nor crafting can fulfil the request, the result reports the known cost, fulfilled output, and exact unfilled output. Profitability stays incomplete.

## Calculation architecture

### Reachable graph

Build and validate the acyclic recipe graph reachable from the selected output. Unknown ingredients and cycles stop calculation with an actionable error. The output is part of the graph so buying it directly is always considered.

### Market acquisition

For order-book optimization, the route fetches listings for every reachable item that does not have a manual override. Requests use the existing concurrency-four queue, retry policy, and short response cache. A failed listing request preserves cached data when available; otherwise that item has unknown supply.

### Integer production plan

The solver models:

- Requested output demand.
- One craft quantity for each craftable item.
- Purchase quantities bounded by each listing tranche.
- Recipe balance constraints connecting crafted outputs to ingredient demand.
- Exact BigInt costs for every selected purchase.

The search operates only on the selected item's reachable subgraph and prunes plans whose fulfilment is worse or whose exact known cost already exceeds the best plan. Listing boundaries and recipe-induced integer boundaries define candidate splits, allowing large quantities without iterating once per unit. Ties prefer fewer craft operations, then fewer distinct purchases, so repeated runs are deterministic.

The solver returns a normalized plan rather than mutating the recipe traversal. Rendering, shopping-list consolidation, profitability, budget search, CSV export, JSON export, and saved plans all consume that normalized result.

### Result contract

Add explicit result fields for:

- Recommendation: `buy`, `craft`, or `mix`.
- Requested, fulfilled, and unfilled output quantities.
- Direct-buy, craft-all, and optimized comparison totals with completeness.
- Per-item bought and crafted quantities.
- Decision explanation and savings where comparable.

All quantities and costs cross HTTP as decimal strings. Existing saved results remain readable; newly saved plans preserve the optimizer result, market timestamp, profile snapshot, overrides, and listing-derived completeness.

## Error handling

- An unavailable API key prevents uncached order-book optimization and gives a clear reconnect message; lowest-listing estimation remains available.
- Authentication, rate-limit, network, or schema failures do not overwrite the last valid market snapshot or listing cache.
- Missing prices or supply produce an incomplete result rather than a fabricated total.
- An optimizer failure returns an actionable error. It never silently falls back to an approximate plan while labeling it lowest cost.

## Interface changes

Use the existing Ascendry visual system and semantic tokens. Add one restrained recommendation panel above the recipe circuit and extend existing table/node patterns rather than introducing new decorative UI. Wording stays literal, sentence-case, and concise. No item icons are added.

Controls and results remain keyboard accessible, preserve visible focus, work at desktop and tablet widths, and respect reduced motion. Any new reusable recommendation or decision component is demonstrated on `/design-guide`.

## Verification

Unit tests cover:

- Buying the final output when cheaper than crafting.
- Crafting the final output when cheaper than buying.
- Mixed quantities at the output and intermediate levels.
- Shared ingredients across multiple recipe branches without double-consuming cheap listings.
- Listing-tier boundaries, finite depth, overrides, missing prices, cycles, and unknown references.
- Exact BigInt arithmetic and very large quantities.
- Deterministic tie-breaking.
- Profitability, budget capacity, and exports using the optimized total.

Integration tests verify listing collection for every reachable item, cache reuse, concurrency limits, API failures, and preservation of last-good data. Playwright verifies a Grand Hall plan plus at least one deep recipe, concise recommendation wording, split nodes, saved-plan reproduction, and incomplete supply.

Acceptance requires the optimizer to run for all current craftable items and to never label an estimate or incomplete lower bound as the true lowest-cost plan.
