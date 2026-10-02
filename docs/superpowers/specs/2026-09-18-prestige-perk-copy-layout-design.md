# Prestige Perk Copy and Layout

## Goal

Make all 28 Prestige perks easy to understand without changing official effect values, maximum levels, profile storage, or calculation behavior.

## Approved design

- Rewrite every perk description as one concise, action-oriented plain-English sentence.
- Keep the official effect string and numeric value separate from the description.
- Render each shared perk card with a clear name, description, labeled effect, and level control.
- Show the perk maximum beside its level input.
- Keep the existing “Active in v1” marker for Insider and Mercantilist.
- Apply the change through the shared perk catalog and shared profile editor so all profiles receive identical copy and layout.

## Accessibility and responsive behavior

- Give each level input a visible label and connect it to the related description and effect with `aria-describedby`.
- Allow long descriptions and effects to wrap without colliding with the input.
- Retain the 2-column desktop grid and 1-column small-screen grid.

## Verification

- Assert that the catalog still contains exactly 28 perks and the maximum-level total remains 888.
- Assert that all descriptions and effects are complete and that calculation-relevant perks remain unchanged.
- Run type checking, linting, unit tests, and a production build.
- Inspect the running Prestige page at desktop and narrow widths.
