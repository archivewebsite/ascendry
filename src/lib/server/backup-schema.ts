import { z } from "zod";
import { nonnegativeString, planInputSchema, timestampSchema } from "@/lib/plan-schema";

const jsonObject = z.string().transform((text, context) => {
  try { return JSON.parse(text) as unknown; }
  catch { context.addIssue({ code: "custom", message: "Invalid backup JSON field." }); return z.NEVER; }
});
const planRow = z.object({
  id: z.string().min(1), name: z.string(), payload_json: jsonObject, result_json: jsonObject,
  created_at: timestampSchema, updated_at: timestampSchema,
}).transform((row, context) => {
  const result = planInputSchema.safeParse({ name: row.name, payload: row.payload_json, result: row.result_json });
  if (!result.success) { context.addIssue({ code: "custom", message: "Invalid saved plan in backup." }); return z.NEVER; }
  return { ...row, name: result.data.name, payload_json: JSON.stringify(result.data.payload), result_json: JSON.stringify(result.data.result) };
});
const delta = z.number().finite().nullable();
export const backupSchema = z.object({
  schemaVersion: z.literal(1), exportedAt: timestampSchema.optional(),
  plans: z.array(planRow).default([]),
  alerts: z.array(z.object({ id: z.string().min(1), id_name: z.string().min(1), direction: z.enum(["below", "above"]),
    threshold: nonnegativeString, enabled: z.union([z.literal(0), z.literal(1)]), triggered_at: timestampSchema.nullable(),
    triggered_price: nonnegativeString.nullable(), created_at: timestampSchema })).default([]),
  snapshots: z.array(z.object({ id: z.number().int().positive().safe(), upstream_updated_at: timestampSchema, captured_at: timestampSchema })).default([]),
  prices: z.array(z.object({ snapshot_id: z.number().int().positive().safe(), id_name: z.string().min(1), price: nonnegativeString.nullable(),
    delta_day: delta, delta_week: delta, delta_month: delta })).default([]),
}).superRefine((backup, context) => {
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(backup.plans.map((row) => row.id)) || !unique(backup.alerts.map((row) => row.id))
    || !unique(backup.snapshots.map((row) => String(row.id))) || !unique(backup.snapshots.map((row) => row.upstream_updated_at))
    || !unique(backup.prices.map((row) => `${row.snapshot_id}\0${row.id_name}`))) context.addIssue({ code: "custom", message: "Duplicate backup row identity." });
  const snapshots = new Set(backup.snapshots.map((row) => row.id));
  for (const row of backup.prices) if (!snapshots.has(row.snapshot_id)) context.addIssue({ code: "custom", message: "Backup price references a missing snapshot." });
  for (const row of backup.alerts) if ((row.triggered_at === null) !== (row.triggered_price === null)) context.addIssue({ code: "custom", message: "Incomplete alert trigger in backup." });
});
