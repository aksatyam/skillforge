/**
 * api.ts is a thin wrapper around `fetch`. With the Sprint 5 BFF cookie
 * bridge in place, it no longer touches sessionStorage, attaches tokens,
 * or handles refresh — all of that lives in the Route Handlers at
 * `app/api/session/*` and `app/api/assessment/[...path]`.
 *
 * As a result, meaningful tests require a running Next server with the
 * Route Handlers mounted. Unit-mocking `fetch` here would just retest
 * JSON parsing and error shaping, which is covered by integration tests
 * in CI against a real Next dev server. Skipping for now.
 */
import { describe, it } from 'vitest';

describe('api client', () => {
  it.skip('tests require a running proxy — see integration suite', () => {});
});
