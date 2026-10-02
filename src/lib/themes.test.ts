import { describe, expect, it } from "vitest";
import { buildThemeTokens, contrast, THEME_PALETTES } from "@/lib/themes";
describe("theme token generator", () => {
  it("has 59 unique palettes", () => { expect(THEME_PALETTES).toHaveLength(59); expect(new Set(THEME_PALETTES.map((palette) => palette.key)).size).toBe(59); });
  it("meets contrast floors across all 118 resolved combinations", () => { for (const palette of THEME_PALETTES) for (const mode of ["light", "dark"] as const) { const tokens = buildThemeTokens(palette, mode); expect(contrast(tokens.foreground, tokens.background), `${palette.name} ${mode} text`).toBeGreaterThanOrEqual(4.5); expect(contrast(tokens.border, tokens.background), `${palette.name} ${mode} border`).toBeGreaterThanOrEqual(3); expect(contrast(tokens.ring, tokens.background), `${palette.name} ${mode} focus`).toBeGreaterThanOrEqual(3); expect(contrast(tokens["primary-foreground"], tokens.primary), `${palette.name} ${mode} action`).toBeGreaterThanOrEqual(4.5); } });
});
