// The API rejects invalid_session_token before running the requested operation.
// Retry only that explicit rejection, never an ambiguous failure of a mutation.
export async function withSessionTokenRetry(
  request: () => Promise<Response>,
): Promise<Response> {
  const response = await request();
  if (response.status !== 401) return response;

  const error = await response.clone().json().catch(() => null);
  if (error?.error !== "invalid_session_token") return response;

  return request();
}
