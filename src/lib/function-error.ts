export async function readFunctionFailure(
  error: unknown,
  messages: Record<string, string>,
  fallback: string,
): Promise<string> {
  if (typeof error !== 'object' || error === null || !('context' in error)) return fallback
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) return fallback

  try {
    const response = await context.clone().json() as { code?: unknown }
    return typeof response.code === 'string' ? messages[response.code] ?? fallback : fallback
  } catch {
    return fallback
  }
}
