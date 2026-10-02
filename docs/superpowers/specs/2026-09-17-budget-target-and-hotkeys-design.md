# Budget Target Mode and Application Hotkeys

## Goal

Make budget a first-class Craft Lab target instead of an optional capacity annotation. A user can select an item, enter a BC budget such as `5.11t`, and receive the maximum number of complete items that can be obtained without exceeding that budget. The returned circuit, decisions, shopping list, profitability, and exports must all describe that computed output quantity.

Add conflict-safe keyboard shortcuts for primary navigation and the main global and Craft Lab actions.

## Craft Lab target modes

Craft Lab adds a **Target** segmented control with two mutually exclusive values:

- **Quantity:** the user enters the required number of output items. This preserves existing calculation behavior.
- **Budget:** the user enters the maximum BC that may be spent. The system calculates the maximum whole output quantity within that budget.

Only the field for the active target mode is displayed. Switching modes preserves the last value entered in each field, but only the active value is submitted. Quantity and budget therefore cannot silently compete.

Both fields accept exact whole-number expressions supported by the existing parser: separators, `k/m/b/t/q` suffixes, scientific notation, arithmetic, and parentheses. `5.11t` normalizes to `5,110,000,000,000`. Non-positive or fractional final values are rejected with a field-relevant error.

The primary action says **Calculate plan** in Quantity mode and **Build from budget** in Budget mode. `Plan` and `Cost model` remain independent controls. Budget mode uses whichever plan and cost model the user selects; **Lowest cost** remains the default and is the recommended budget strategy.

## Budget optimization behavior

The optimization objective is lexicographic:

1. Maximize the number of complete output items.
2. Never exceed the submitted budget.
3. Among plans producing the same maximum output, minimize total cost.
4. Preserve the optimizer's deterministic tie-breaking rules.

For **Lowest listing**, preview prices are treated as unlimited estimates. The existing exact-integer cost calculation and monotonic capacity search determine the maximum output, after which the normal calculator generates the complete plan for that quantity.

For **Order-book depth** with **Lowest cost**, the existing integer optimizer receives the budget constraint and maximizes fulfilled output over final-item purchases and recursive crafting. The returned production plan becomes the result directly; it must not be reduced to a side-note capacity value or recomputed using an unrelated quantity. Final purchases, intermediate purchases, crafts, listing tiers, overrides, and shared ingredients all participate in the same optimization.

For Direct and Craft-all plans, budget capacity is calculated using those strategies and the selected price model. The result is then generated for the maximum complete quantity.

All money and quantities remain exact decimal strings over HTTP and use BigInt validation after solving. No floating-point arithmetic is used for budget, spend, unspent BC, quantities, or unit costs.

## Budget result contract

Requests add `targetMode: "quantity" | "budget"`. Quantity is required only for Quantity mode; budget is required only for Budget mode. Saved plans retain the active target mode and the normalized input so recalculation is reproducible.

Budget-mode results add:

- `budget.limit`: normalized submitted budget.
- `budget.spent`: exact selected-plan cost.
- `budget.unspent`: `limit - spent`.
- `budget.averageUnitCost`: integer display value derived from `spent / produced`, or null when no output is affordable.
- `budget.limitingFactor`: `budget`, `market-depth`, or `unknown-supply`.

The result target quantity is the computed maximum complete output. Existing result consumers therefore render the circuit, build decisions, shopping list, profitability, CSV, JSON, and saved plan for the correct quantity without maintaining a second shadow result.

The old `budgetCapacity` display is removed from the profitability card. Backward-compatible result parsing may retain the optional legacy field for existing saved plans, but new calculations use the first-class budget summary.

## Budget result interface

Budget mode begins with a compact summary showing:

- **Items produced**
- **Spent**
- **Unspent**
- **Average cost**

The recommendation immediately below continues to state Buy, Craft, or Mix. The exact market timestamp remains visible. If the maximum output is constrained by known order-book depth before the budget is exhausted, the summary states **Limited by available listings**. If no complete item is affordable, the page shows zero produced, the unspent full budget, and the additional BC required for the cheapest known next item when that amount can be determined.

Lowest-listing results are labeled estimates. Order-book results never extrapolate beyond known listings. Unknown supply or missing prices remain explicit and cannot be described as a proven maximum.

## Keyboard shortcuts

A single application-level shortcut controller owns key handling and navigation. The approved shortcuts are:

| Shortcut | Action |
| --- | --- |
| `G`, then `D` | Dashboard |
| `G`, then `M` | Market |
| `G`, then `C` | Craft Lab |
| `G`, then `P` | Plans |
| `G`, then `R` | Prestige |
| `G`, then `S` | Settings |
| `Ctrl+Enter` | Calculate the active Craft Lab target |
| `Ctrl+Shift+S` | Save the current Craft Lab plan |
| `Shift+R` | Refresh market data |
| `/` | Focus the current page search; from a page without search, open Market and focus its search |
| `?` | Open the keyboard-shortcut guide |

Single-character shortcuts and navigation sequences do not fire from inputs, textareas, selects, content-editable elements, or while modifier keys are held. The two explicit action chords may run from Craft Lab form controls so a user can calculate or save without leaving the field.

The `G` prefix expires after a short timeout and has no action by itself. Browser and operating-system shortcuts are not overridden. Shortcut listeners are installed once and cleaned up on unmount.

Global actions are connected through a small typed action registry so page components register only actions that exist on the current page. `Shift+R` uses the same refresh mutation as the visible button. Craft Lab registers calculate and save callbacks. Searchable pages identify their search control through a shared data attribute.

Visible buttons expose shortcut hints through titles or adjacent compact labels where useful, and interactive elements use `aria-keyshortcuts`. The `?` guide is a keyboard-accessible dialog with focus trapping, Escape-to-close behavior, a visible close button, and the complete shortcut table. The interface adds no item icons.

## Errors and edge cases

- A budget below the cheapest complete result returns zero items without throwing.
- A zero or negative budget is rejected.
- A zero-cost or otherwise unbounded lowest-listing path returns an actionable error instead of inventing an arbitrary maximum.
- Missing preview prices make a lowest-listing maximum unproven and are labeled incomplete.
- Exhausted order-book supply may limit output below the budget; the exact unused budget is still shown.
- Authentication, rate-limit, network, and schema failures preserve cached data and follow existing diagnostics behavior.
- A shortcut does nothing when its action is unavailable; it does not navigate, submit an unrelated form, or produce an error.
- Repeated or held keys do not trigger duplicate calculations, saves, or refreshes.

## Verification

Unit tests cover:

- `5.11t`, comma-separated exact values, scientific notation, and expressions.
- Maximum output exactly at, immediately below, and immediately above a cost boundary.
- Lexicographic behavior: maximum output first, then minimum spend.
- Exact spent and unspent arithmetic for very large budgets.
- Buy, craft, and mixed recursive plans under a budget.
- Shared finite listings and order-book tier boundaries.
- Direct, Craft-all, and Lowest-cost budget modes.
- Zero affordable output, supply-limited output, missing supply, and zero-cost paths.
- Saved-plan serialization and recalculation with target mode retained.

Component and Playwright tests cover:

- Switching Quantity and Budget without submitting the inactive value.
- A Grand Hall `5.11t` calculation rendering the computed quantity everywhere.
- Budget summary, recommendation, circuit, decisions, shopping list, profitability, and exports agreeing on the same quantity and cost.
- Every navigation sequence, calculate, save, refresh, search, and shortcut-guide shortcut.
- Shortcuts being ignored while typing, except for the two approved action chords.
- Shortcut dialog focus behavior and accessible labels.

Acceptance requires that a Budget calculation never presents the original Quantity value as its result, never exceeds the normalized budget, reports exact unspent BC, and uses the selected recursive plan and price model for every displayed and exported figure.
