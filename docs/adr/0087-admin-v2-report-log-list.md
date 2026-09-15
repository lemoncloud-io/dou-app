# ADR-0027: An admin-v2 screen listing report logs

> Status: Accepted · Decided: 2026-07-23

## Context

`reportError` (automatic collection) and `reportIssue` (the user-facing issue report widget) in
`libs/web-core/src/api/common.ts` both POST to `${DOU_ENDPOINT}/hello/report`, carrying the real
diagnostic payload — error message, stack, http, user, cloud, device, network, env, url, timestamp, and
for an issue the recent logs, version and path as well — **serialised as a JSON string** in
`SlackReportBody.message`. Because `save: true`, the backend keeps a history of what was sent.

Administrators need a screen in admin-v2 to read those reports. The query API:

```
GET ${DOU_ENDPOINT}/mocks/0/list   (= /dou-v1/mocks/0/list per the spec)
Param<any>{}  Body<None>{}  → ListResult<MockView, AggrResult>
@see chatic-backend-api #0.26.701
```

Saving (`/hello/report`) and reading (`/mocks/0/list`) are the same DOU backend, so admin-v2 can use
`webTransport.buildSignedRequest(...)`, which it already uses.

Constraints and unknowns:

- **`MockView` has no top-level `title` or `message`.** The report body is buried in `meta` (derived
  from CoreModel, `string | any`); what is exposed at the top level is roughly
  `id, name, ns, type, stereo, uid, meta, createdAt, updatedAt`.
- Whether `/mocks/0/list` **supports text search and a createdAt range** cannot be confirmed from the
  front-end repo (it belongs to the backend). Neither can the actual response shape (whether the
  payload arrives in `meta` as an object or as a JSON string).
- admin-v2 has only the `socket-lab` feature so far, and **no shared table component**. A list is built
  from `api/*Api.ts` (webTransport) + `hooks/use-*-list.ts` (react-query) + `pages/*Page.tsx` +
  `routes/index.tsx`, with the UI written directly in Tailwind or inline — that is the convention.

## Decision

Add an **admin report log list screen** to admin-v2 as a new feature.

**In scope:**

- What is listed: **every report**, from every user. Both `reportError` and `reportIssue` appear, and
  the type is told apart by the title prefix (`[app] error` vs `[app] issue: ...`). There is no
  filter for a particular user (uid).
- The data source: `GET ${DOU_ENDPOINT}/mocks/0/list` → `ListResult<MockView, AggrResult>`, called
  through
  ``webTransport.buildSignedRequest({ method: 'GET', baseURL: `${DOU_ENDPOINT}/mocks/0/list` })``.
  `DOU_ENDPOINT` comes from `@chatic/web-core` (the same base as `/hello/report`).
- Feature structure: mirror `socket-lab` — `apps/admin-v2/src/app/features/<feature>/` with `api/`
  (the webTransport call plus response mapping), `hooks/` (a react-query `useQuery`), `pages/` and
  `routes/` — registered in `src/app/routes.tsx` and the sidebar navigation.
- List columns (summary): type (error / issue), title, env, app, time (createdAt). Newest first.
- Filters and controls: **text search plus a date range**, and nothing else. env / app chips are out of
  scope.
- Detail: clicking a row opens a **side drawer (modal)**. Parse the JSON in `message` and render the
  `ErrorReportPayload` / issue extras field by field — message, stack, componentStack, http
  (status/code/responseData), user (uid/name/role/…), cloud (cloudId/backend/placeId/…), device,
  network, and for an issue the recent logs, version, path and viewport. The set of fields to show
  follows what `apps/web`'s issue report widget (`IssueReportOverlay` → `buildReportContext`) attaches.
  On a parse failure, fall back to raw JSON.

**Out of scope:**

- "Only mine" (a uid filter), env / app filter chips, and write actions such as deleting or editing a
  report.
- Live streaming or auto-refresh (a manual query plus react-query refetch is enough).

## Alternatives

- **A server-side uid filter for "only what I sent"** — this matched the phrase "my log list" in the
  request. But (1) the scope was settled as admin-wide monitoring, and (2) whether a report's uid is
  stamped into `MockView.uid` is unconfirmed, so a server filter cannot be trusted. Dropped.
- **Use the generated `@lemoncloud/chatic-backend-api` client** — that SDK provides the `MockView` and
  `AggrResult` types only, with no client method for `/mocks/0/list`. Calling `webTransport` directly,
  as admin-v2 does elsewhere, wins.
- **Inline row expansion, or a summary with no detail** — the payload is large and diagnosis needs
  stack, http, user and cloud, so a side drawer that keeps the context is better in practice. Dropped.
- **Add env / app filter chips** — the user chose text and date only. Out of scope, possibly later.

## Consequences

- **Upside**: saving and reading share a backend and a transport, so this attaches with no new
  infrastructure. Seeing automatic collection (`reportError`) on the same screen makes product error
  tracking genuinely possible.
- **Trade-offs and risks**:
    - The detail view is coupled to the JSON shape serialised into `SlackReportBody.message`. A change
      in the backend's storage format breaks parsing, so it uses **defensive parsing plus a raw JSON
      fallback**.
    - Whether `/mocks/0/list` supports search and range parameters is unconfirmed. **Print the real
      response and parameters first during implementation.** If the server does not support them,
      search and the date range fall back to client-side filtering over the loaded page (partial
      search, limited to the current page), and the UI says so.
    - Where the payload actually sits in a `MockView` response (`meta` as an object or a string, or
      something that has to be reassembled) also has to be verified before building.
    - The screen exposes **every user's** uid, name and cloud information. Access relies only on the
      existing `ProtectedRoute` (admin authentication), so whether extra permission gating is needed is
      left as a later judgement (for this scope, the existing gate is considered enough).

## Next steps

This ADR feeds the spec phase (Phase A) of `dev-2_implement`. The first thing the spec settles: the
real response shape of `/mocks/0/list` and which query parameters it supports.
