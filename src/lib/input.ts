export class InputError extends Error {}

export function parseBcId(value: string) {
  if (!/^\d+$/.test(value)) throw new InputError("BcID must be a positive whole number.");
  const bcId = Number(value);
  if (!Number.isSafeInteger(bcId) || bcId <= 0) throw new InputError("BcID is outside the supported range.");
  return bcId;
}
