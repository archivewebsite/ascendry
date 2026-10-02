export async function assertResponseOk(response: Response, fallback: string) {
  if (response.ok) return;
  const body = await response.clone().json().catch(() => null) as { error?: unknown } | null;
  throw new Error(typeof body?.error === "string" ? body.error : fallback);
}
