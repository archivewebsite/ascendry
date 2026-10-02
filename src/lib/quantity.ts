interface Rational {
  numerator: bigint;
  denominator: bigint;
}

export const NUMBER_SCALES = [
  { exponent: 3, suffix: "k", name: "thousand" },
  { exponent: 6, suffix: "m", name: "million" },
  { exponent: 9, suffix: "b", name: "billion" },
  { exponent: 12, suffix: "t", name: "trillion" },
  { exponent: 15, suffix: "q", name: "quadrillion" },
  { exponent: 18, suffix: "qi", name: "quintillion" },
  { exponent: 21, suffix: "sx", name: "sextillion" },
  { exponent: 24, suffix: "sp", name: "septillion" },
  { exponent: 27, suffix: "oc", name: "octillion" },
  { exponent: 30, suffix: "no", name: "nonillion" },
  { exponent: 33, suffix: "dc", name: "decillion" },
] as const;

const SUFFIXES = new Map(NUMBER_SCALES.flatMap(scale => {
  const multiplier = 10n ** BigInt(scale.exponent);
  return [[scale.suffix, multiplier], [scale.name, multiplier]] as Array<[string, bigint]>;
}));

export type NumberDisplayFormat = "compact" | "words" | "exact";
export function isNumberDisplayFormat(value: unknown): value is NumberDisplayFormat {
  return value === "compact" || value === "words" || value === "exact";
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x || 1n;
}

function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) throw new Error("Division by zero is not allowed.");
  const sign = denominator < 0n ? -1n : 1n;
  const factor = gcd(numerator, denominator);
  return { numerator: (numerator / factor) * sign, denominator: (denominator / factor) * sign };
}

function parseNumberToken(raw: string): Rational {
  const match = raw.match(/^((?:\d[\d,]*)(?:\.\d+)?|\.\d+)(?:e([+-]?\d+))?(?:\s*([a-z]+))?$/i);
  if (!match) throw new Error(`Invalid number: ${raw}`);
  const grouped = match[1] ?? "";
  if (grouped.includes(",") && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(grouped)) throw new Error(`Invalid thousands grouping: ${raw}`);
  const numberPart = (match[1] ?? "").replaceAll(",", "");
  const exponent = Number.parseInt(match[2] ?? "0", 10);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) {
    throw new Error("Scientific exponent is too large.");
  }
  const [whole = "0", fraction = ""] = numberPart.split(".");
  let value = rational(BigInt(`${whole || "0"}${fraction}`), 10n ** BigInt(fraction.length));
  if (exponent > 0) value = rational(value.numerator * 10n ** BigInt(exponent), value.denominator);
  if (exponent < 0) value = rational(value.numerator, value.denominator * 10n ** BigInt(-exponent));
  const suffix = match[3]?.toLowerCase();
  if (suffix) {
    const multiplier = SUFFIXES.get(suffix);
    if (!multiplier) throw new Error(`Unknown number scale: ${suffix}`);
    value = rational(value.numerator * multiplier, value.denominator);
  }
  return value;
}

type Token = { type: "number"; value: string } | { type: "operator"; value: string } | { type: "eof" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index]!;
    if (/\s/.test(char)) { index += 1; continue; }
    if ("+-*/()".includes(char)) { tokens.push({ type: "operator", value: char }); index += 1; continue; }
    const match = input.slice(index).match(/^((?:\d[\d,]*)(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?:\s*[a-z]+)?/i);
    if (!match?.[0]) throw new Error(`Unexpected character at position ${index + 1}.`);
    tokens.push({ type: "number", value: match[0] });
    index += match[0].length;
  }
  tokens.push({ type: "eof" });
  return tokens;
}

export function parseQuantityExpression(input: string, options: { allowZero?: boolean } = {}): bigint {
  if (!input.trim()) throw new Error("Enter a quantity.");
  const tokens = tokenize(input);
  let cursor = 0;
  const peek = () => tokens[cursor] ?? { type: "eof" as const };
  const take = () => tokens[cursor++] ?? { type: "eof" as const };

  const parsePrimary = (): Rational => {
    const token = take();
    if (token.type === "number") return parseNumberToken(token.value);
    if (token.type === "operator" && token.value === "(") {
      const value = parseExpression();
      const closing = take();
      if (closing.type !== "operator" || closing.value !== ")") throw new Error("Missing closing parenthesis.");
      return value;
    }
    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      const value = parsePrimary();
      return token.value === "-" ? rational(-value.numerator, value.denominator) : value;
    }
    throw new Error("Expected a number or parenthesis.");
  };

  const parseTerm = (): Rational => {
    let left = parsePrimary();
    while (true) {
      const next = peek();
      if (next.type !== "operator" || (next.value !== "*" && next.value !== "/")) break;
      const operator = take();
      const right = parsePrimary();
      left = operator.type === "operator" && operator.value === "*"
        ? rational(left.numerator * right.numerator, left.denominator * right.denominator)
        : rational(left.numerator * right.denominator, left.denominator * right.numerator);
    }
    return left;
  };

  const parseExpression = (): Rational => {
    let left = parseTerm();
    while (true) {
      const next = peek();
      if (next.type !== "operator" || (next.value !== "+" && next.value !== "-")) break;
      const operator = take();
      const right = parseTerm();
      const signed = operator.type === "operator" && operator.value === "-" ? -right.numerator : right.numerator;
      left = rational(left.numerator * right.denominator + signed * left.denominator, left.denominator * right.denominator);
    }
    return left;
  };

  const result = parseExpression();
  if (peek().type !== "eof") throw new Error("Unexpected token after the expression.");
  if (result.denominator !== 1n) throw new Error("The final quantity must be a whole number.");
  if (result.numerator < 0n || (!options.allowZero && result.numerator === 0n)) throw new Error(options.allowZero ? "The final value must not be negative." : "The final quantity must be greater than zero.");
  return result.numerator;
}

export function normalizeDecimalString(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value)) return value.toString();
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value).toString();
  throw new Error("Expected an exact integer value.");
}

export function formatInteger(value: string | bigint, compact = false): string {
  return formatDisplayInteger(value, compact ? "compact" : "exact");
}

const integerFormatter = new Intl.NumberFormat("en-US");

// Round with integer arithmetic; converting these amounts to Number loses digits.
function roundedCoefficient(abs: bigint, divisor: bigint, decimals: number): bigint {
  const precision = 10n ** BigInt(decimals);
  return (abs * precision + divisor / 2n) / divisor;
}

function decimalCoefficient(scaled: bigint, decimals: number): string {
  const precision = 10n ** BigInt(decimals);
  const fraction = (scaled % precision).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${scaled / precision}${fraction ? `.${fraction}` : ""}`;
}

export function formatDisplayInteger(value: string | bigint, format: NumberDisplayFormat = "compact"): string {
  const number = typeof value === "bigint" ? value : BigInt(value);
  const abs = number < 0n ? -number : number;
  if (format === "exact" || abs < 1_000n) return integerFormatter.format(number);
  const sign = number < 0n ? "-" : "";
  // Beyond named scales, scientific notation keeps the label bounded.
  if (abs >= 10n ** 36n) {
    let exponent = abs.toString().length - 1;
    let scaled = roundedCoefficient(abs, 10n ** BigInt(exponent), 2);
    if (scaled >= 1_000n) { scaled /= 10n; exponent += 1; }
    return `${sign}${decimalCoefficient(scaled, 2)}e${exponent}`;
  }
  let index = NUMBER_SCALES.findLastIndex(scale => abs >= 10n ** BigInt(scale.exponent));
  let scale = NUMBER_SCALES[index]!;
  let divisor = 10n ** BigInt(scale.exponent);
  let decimals = abs >= divisor * 100n ? 1 : 2;
  let scaled = roundedCoefficient(abs, divisor, decimals);
  // 999.999 million should display as 1 billion, rather than 1,000 million.
  if (scaled >= 1_000n * 10n ** BigInt(decimals)) {
    index += 1;
    const nextScale = NUMBER_SCALES[index];
    if (!nextScale) return `${sign}1e36`;
    scale = nextScale;
    divisor = 10n ** BigInt(scale.exponent);
    decimals = 2;
    scaled = roundedCoefficient(abs, divisor, decimals);
  }
  const coefficient = decimalCoefficient(scaled, decimals);
  return `${sign}${coefficient}${format === "words" ? ` ${scale.name}` : scale.suffix}`;
}
