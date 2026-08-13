// Task #3098 — the press-templates client↔server API path contract in ONE
// place. Both the detail page and the dedicated Test page build their
// mutation URLs from these helpers; apiPaths.test.ts asserts each one matches
// a route actually registered in server/pressTemplatesPortal.ts, so a drifted
// path fails in CI instead of 404ing in the portal.

export const templateTestPath = (pressId: string, specId: string): string =>
  `/api/press/${pressId}/templates/${specId}/test`;

export const certifyRunPath = (pressId: string, specId: string, runId: string): string =>
  `/api/press/${pressId}/templates/${specId}/runs/${runId}/certify`;
