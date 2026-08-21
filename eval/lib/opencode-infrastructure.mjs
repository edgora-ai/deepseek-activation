/** OpenCode infrastructure-classifier version written into run metadata. */
export const OPENCODE_INFRASTRUCTURE_METHOD_VERSION = 2

/**
 * Detects provider failures from OpenCode process logs.
 *
 * Structured stdout events are authoritative. Plain-text fallback is limited to
 * stderr because stdout includes model-visible tool results and may contain
 * historical error text that is not an error from the current session.
 *
 * @param {string} stdout OpenCode JSON-lines output.
 * @param {string} stderr OpenCode process stderr.
 * @returns {{kind: string, name: string | null, statusCode: number | null, retryable: boolean} | null}
 */
export function detectOpenCodeInfrastructureFailure(stdout, stderr) {
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    const error = event?.type === 'error' ? event.error : null
    const data = error?.data
    if (
      error?.name === 'APIError'
      || Number.isFinite(data?.statusCode)
      || data?.isRetryable === true
    ) {
      return {
        kind: 'provider-api-error',
        name: error?.name ?? null,
        statusCode: Number.isFinite(data?.statusCode)
          ? data.statusCode
          : null,
        retryable: data?.isRetryable === true,
      }
    }
  }

  if (
    /FreeUsageLimitError|Rate limit exceeded|\bAPIError\b|HTTP\s+(?:429|5\d\d)\b/i
      .test(stderr)
  ) {
    return {
      kind: 'provider-api-error',
      name: null,
      statusCode: null,
      retryable: false,
    }
  }

  return null
}
