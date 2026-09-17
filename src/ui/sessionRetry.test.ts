import assert from "node:assert/strict";
import { it } from "node:test";
import { withSessionTokenRetry } from "./sessionRetry.ts";

it("reacquires a session through a new request after an explicit pre-operation rejection", async () => {
  let attempts = 0;
  const result = await withSessionTokenRetry(async () => {
    attempts++;
    return attempts === 1
      ? Response.json({ error: "invalid_session_token" }, { status: 401 })
      : Response.json({ syncedCount: 12 });
  });
  assert.equal(attempts, 2);
  assert.deepEqual(await result.json(), { syncedCount: 12 });
});

it("stops after one retry and preserves the error body", async () => {
  let attempts = 0;
  const result = await withSessionTokenRetry(async () => {
    attempts++;
    return Response.json({ error: "invalid_session_token" }, { status: 401 });
  });
  assert.equal(attempts, 2);
  assert.equal(result.status, 401);
  assert.equal((await result.json()).error, "invalid_session_token");
});

it("never retries successful or ambiguous mutation responses", async () => {
  for (const status of [200, 401, 403, 429, 500, 502]) {
    let attempts = 0;
    const result = await withSessionTokenRetry(async () => {
      attempts++;
      return Response.json({ error: "other" }, { status });
    });
    assert.equal(attempts, 1);
    assert.equal(result.status, status);
    assert.equal((await result.json()).error, "other");
  }
});

it("does not retry network errors that could follow a completed mutation", async () => {
  let attempts = 0;
  await assert.rejects(withSessionTokenRetry(async () => {
    attempts++;
    throw new Error("Connection lost");
  }), /Connection lost/);
  assert.equal(attempts, 1);
});
