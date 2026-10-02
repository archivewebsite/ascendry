export type AppearanceMode = "adaptive" | "light" | "dark";
export type ResolvedMode = "light" | "dark";

export interface ThemePalette {
  key: string;
  name: string;
  group: "Bench" | "Signal" | "Power";
  colors: readonly [string, string, string, string];
}

const names = {
  Bench: ["Ground Plane", "Oscilloscope Sky", "Solder Mask", "Logic High", "Wheatstone Bridge", "Green LED", "Ceramic Trace", "Photoresist", "Shielded Pair", "Rosin Flux", "Carbon Film", "Hall Effect", "Sodium Arc", "Copper Clad", "Vacuum Tube", "Pilot Light", "High Voltage", "Ferrite Core", "Corona Glow"],
  Signal: ["Bridge Rectifier", "Thermal Pad", "Fluxgate", "Violet Laser", "Amber Diode", "PN Junction", "Waveguide Blue", "JFET Gate", "Copper Busbar", "Phase Shifter", "Current Mirror", "Schottky Barrier", "Avalanche Diode", "PCB Matrix", "Carrier Wave", "Thermal Relay", "Bifilar Coil", "Capacitive Touch", "Gold Contact", "Prism Coupler"],
  Power: ["Midnight Bus", "Neon Cathode", "Resonant Cavity", "Carbon Chassis", "Cobalt Core", "Ember Filament", "Subsea Transducer", "Plasma Bias", "Green Terminal", "Ruby Rectifier", "Indigo Backplane", "Bronze Winding", "Aurora Arc", "Lunar Capacitor", "Magenta Bias", "Cryogenic Oscillator", "Green Ferrite", "Saffron Signal", "Eclipse Voltage", "Crimson Phasor"],
} as const;

const colors = [
  ["#111111", "#5F5F5F", "#D8D8D8", "#F7F7F7"], ["#B4D7EB", "#F2CDBF", "#E3F1F8", "#2B394D"], ["#A7DAD8", "#F4CDB5", "#E8F3E9", "#263C3C"], ["#DDF1BC", "#B8E3DE", "#F3DDA9", "#294247"], ["#7FAE9B", "#A86B39", "#EFE7DA", "#34373C"], ["#84C370", "#BFE1B2", "#E4F4DE", "#1C271B"], ["#D0E7B4", "#B7E1DC", "#F2C8B7", "#344036"], ["#C9E3A2", "#F5D3A3", "#F3EABF", "#33402E"], ["#BED2DC", "#D2DEC4", "#ECC2AF", "#323B45"], ["#F3C4D0", "#C3DDEC", "#EAE3C2", "#343D49"], ["#F6C2B5", "#F4D7A8", "#D9EAD8", "#3A3632"], ["#F4C0B4", "#C7EBD7", "#F6E6BC", "#2E3D38"], ["#F4E6A6", "#C4E2C5", "#F4C0AE", "#3B3A30"], ["#1E2533", "#F4B183", "#E7D5C5", "#6B4D45"], ["#E86A33", "#F4E9D8", "#24212C", "#8A2E4F"], ["#FFAF87", "#355CDE", "#F2EFEA", "#A5553A"], ["#F2C230", "#1C1B20", "#F9F7F2", "#D94841"], ["#5B2E6D", "#B96A4B", "#D7F1E3", "#17131E"], ["#8E89CD", "#C2B9E9", "#E7E0F7", "#1C1A2E"],
  ["#D85D72", "#58A88B", "#FFF7F5", "#38272D"], ["#E96F51", "#F0B95A", "#FFF7ED", "#3C2A32"], ["#2E9C76", "#9BD6C6", "#F3FBF7", "#18352E"], ["#7C5CE7", "#C7B8F5", "#F8F6FF", "#28213D"], ["#D99000", "#F2CF5B", "#FFFBEA", "#3D341B"], ["#C94F7C", "#EEA6BD", "#FFF5F8", "#422434"], ["#2674C8", "#8EC5F2", "#F3F9FE", "#17324D"], ["#568B62", "#ABC7A3", "#F5FAF2", "#26362A"], ["#DD6248", "#F3A58F", "#FFF6F2", "#472C27"], ["#8A5EC8", "#D3BDEF", "#FAF7FF", "#332743"], ["#168A8D", "#7CCFD0", "#F1FBFB", "#17383A"], ["#C77910", "#F0C574", "#FFF9EC", "#3D2D19"], ["#B14872", "#E7A8C0", "#FFF5F9", "#3F2330"], ["#69A447", "#B8D89B", "#F7FBEF", "#2C3A24"], ["#217DA8", "#85CBE0", "#F2FBFE", "#183743"], ["#E2673F", "#F1B36B", "#FFF7F0", "#482B21"], ["#6F68C9", "#BCB7EE", "#F7F6FF", "#292842"], ["#168E7B", "#8AD9C6", "#F0FCF8", "#173A34"], ["#B8860B", "#E8C766", "#FFFBEE", "#3B3217"], ["#5D6FE5", "#E87591", "#F8F8FF", "#272B48"],
  ["#66D9C1", "#7AA7FF", "#0C1519", "#EAF8F5"], ["#B9E85C", "#54C7EC", "#11160D", "#F3FFE4"], ["#9B8CFF", "#F0A66A", "#111224", "#F3F1FF"], ["#E1E4EA", "#7D8796", "#0E1014", "#F7F8FA"], ["#5C9DFF", "#E182B4", "#0B1425", "#EDF4FF"], ["#F28C52", "#E5C07B", "#1A100D", "#FFF2E8"], ["#45C4C8", "#7CA6D8", "#07191D", "#EAFBFC"], ["#CA8BE8", "#EBA4C9", "#1A0E20", "#FBEFFC"], ["#72C98A", "#C5D66D", "#0B1A12", "#F0F9F2"], ["#EE6A78", "#F0A38F", "#210D13", "#FFF0F2"], ["#899CFF", "#66C0D0", "#0D1026", "#F1F3FF"], ["#D6A15D", "#8AC6A8", "#1A130B", "#FFF5E6"], ["#6FE1B8", "#B48CFF", "#0B171B", "#EEFFF9"], ["#A9B4C4", "#6D88A9", "#12161D", "#F4F7FB"], ["#E77BC3", "#8FA7FF", "#1C0D1A", "#FFF0FB"], ["#81D4FA", "#A8B5FF", "#09151F", "#EFFAFF"], ["#9BCB7A", "#D1A96B", "#11190D", "#F4FBEF"], ["#F3BE5B", "#E57B6F", "#1C1509", "#FFF8E8"], ["#AF8CFF", "#6ED4C3", "#120D1E", "#F7F1FF"], ["#FF7A82", "#C494FF", "#210D12", "#FFF1F2"],
] as const;

const allNames = [...names.Bench.map((name) => ({ name, group: "Bench" as const })), ...names.Signal.map((name) => ({ name, group: "Signal" as const })), ...names.Power.map((name) => ({ name, group: "Power" as const }))];

export const THEME_PALETTES: ThemePalette[] = allNames.map((entry, index) => ({
  ...entry,
  key: entry.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  colors: colors[index]!,
}));

export const DEFAULT_THEME_KEY = "ground-plane";

function rgb(hex: string) { return { r: Number.parseInt(hex.slice(1, 3), 16), g: Number.parseInt(hex.slice(3, 5), 16), b: Number.parseInt(hex.slice(5, 7), 16) }; }
function hex({ r, g, b }: { r: number; g: number; b: number }) { return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`; }
export function mix(a: string, b: string, ratio: number) { const x = rgb(a), y = rgb(b); return hex({ r: x.r + (y.r - x.r) * ratio, g: x.g + (y.g - x.g) * ratio, b: x.b + (y.b - x.b) * ratio }); }
function luminance(value: string) { const c = Object.values(rgb(value)).map((v) => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!; }
export function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
function bestText(background: string) { return contrast("#FFFFFF", background) >= contrast("#0B0E12", background) ? "#FFFFFF" : "#0B0E12"; }
function ensureContrast(color: string, background: string, target: number) { if (contrast(color, background) >= target) return color; const endpoint = bestText(background); for (let i = 1; i <= 100; i += 1) { const candidate = mix(color, endpoint, i / 100); if (contrast(candidate, background) >= target) return candidate; } return endpoint; }

export function buildThemeTokens(palette: ThemePalette, mode: ResolvedMode) {
  const sorted = [...palette.colors].sort((a, b) => luminance(a) - luminance(b));
  const darkest = sorted[0]!, lightest = sorted[3]!;
  const background = mode === "light" ? mix(lightest, "#FFFFFF", .88) : mix(darkest, "#05070A", .62);
  const card = mode === "light" ? mix(lightest, "#FFFFFF", .68) : mix(darkest, lightest, .07);
  const cardStrong = mode === "light" ? "#FFFFFF" : mix(darkest, lightest, .11);
  const foreground = bestText(background);
  const mutedForeground = ensureContrast(mix(foreground, background, .34), background, 4.5);
  const primary = ensureContrast(palette.colors[0], background, 4.5);
  const border = ensureContrast(mix(foreground, background, .7), background, 3);
  const ring = ensureContrast(palette.colors[1], background, 3);
  const positive = ensureContrast("#248A58", background, 4.5);
  const negative = ensureContrast("#C53C54", background, 4.5);
  return {
    "color-scheme": mode,
    background, foreground, card, "card-strong": cardStrong,
    muted: mix(background, foreground, mode === "light" ? .055 : .09), "muted-foreground": mutedForeground,
    primary, "primary-foreground": bestText(primary), secondary: ensureContrast(palette.colors[1], background, 3),
    border, ring, positive, negative, warning: ensureContrast("#9A6500", background, 4.5),
    "chart-1": primary, "chart-2": ensureContrast(palette.colors[1], background, 3), "chart-3": ensureContrast(palette.colors[2], background, 3), "chart-4": ensureContrast(palette.colors[3], background, 3),
  };
}

export function themeStyle(paletteKey: string, mode: ResolvedMode): Record<string, string> {
  const palette = THEME_PALETTES.find((item) => item.key === paletteKey) ?? THEME_PALETTES[0]!;
  return Object.fromEntries(Object.entries(buildThemeTokens(palette, mode)).map(([key, value]) => [`--${key}`, value]));
}
