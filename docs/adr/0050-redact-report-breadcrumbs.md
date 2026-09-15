# ADR-0050: End the no-scrubbing policy for logs attached to reports, and apply key-based masking

> Status: Accepted · Decided: 2026-08-11
> Related: [ADR-0017](./0017-issue-report-floating-widget.md) (the v1 "attach without scrubbing" decision —
> already Superseded) ·
> [ADR-0047 unified logging](./0047-unified-logging-core-and-report-traceability.md) (scoped this item out as
> "a policy change is a separate decision") · [ADR-0029](./0029-error-report-categorization-and-enrichment.md)

## Context

When ADR-0017 defined issue-report v1, it stated flatly: "**logs and device state are auto-attached without
scrubbing** (v1). No separate consent flow." (line 45). The premise at the time was narrow — one deliberate,
user-initiated report, sent once, to a channel the team watches.

That premise has since widened three times.

- **ADR-0029** attached the same log tail to automatic error reports (`reportError`) too. Now it goes out
  every time an error occurs, regardless of user intent.
- **ADR-0047** switched the breadcrumb source, on hybrid, to the native merged buffer. Native logs now mix
  into a slot that used to hold only web logs.
- The same ADR-0047 **persisted the buffer** — sessionStorage on web, MMKV on mobile. Data that used to exist
  only for the instant of transmission now stays on the device.

On top of that, reports land in a shared Slack channel. v1's premise of "only the team sees it" no longer
holds now that the channel's reach has widened and storage has entered the picture.

Meanwhile, this same repo already had the answer. Transport's network logging
(`libs/http/src/log/networkLog.ts`) already applies `redactSensitive` to request params/body, and both the
masked-key list (`SENSITIVE_KEYS`) and its implementation (`libs/logger/src/redaction/redact.ts`) already
existed. **Only the breadcrumb path was bypassing that treatment** — that is, the same codebase held two
different answers to "what counts as a secret."

## Decision

**Apply field-name-based masking inside `safeStringify`** (`libs/logger/src/serialization/safeStringify.ts`).
Any value under a key that matches `SENSITIVE_KEYS` is replaced with `[REDACTED]`.

- **The single application point is `safeStringify`.** `serializeLogs`'s consumers are exactly the report
  paths (`reportError`/`reportIssue`) and persistence (sessionStorage/MMKV), so one gate here covers the
  whole surface.
- **The check runs inside the JSON replacer.** It reaches nested objects and array elements, and runs
  **before** the Error branch, closing off the leak where an Error stored under a sensitive key gets
  expanded into name/message/stack.
- **The criterion is the same `SENSITIVE_KEYS` transport already uses.** No new list is created — if the two
  paths diverged, it would only be a matter of time before one got updated and the other didn't.

### Out of scope

- **Secrets embedded inside a string.** With no field name to key off of, there's no basis for a decision.
  Pattern guessing (regex-hunting for JWT/key shapes) is left out, judged too costly in false positives that
  corrupt ordinary messages. If some call site puts a token directly into `message`, that's a bug to fix at
  the call site.
- **User consent flow.** ADR-0017's "no separate consent" stands. This decision is about what gets sent, not
  how consent is obtained.
- **The device snapshot.** `buildReportContext` already curates its fields to exclude push tokens and
  persistent identifiers (no action needed here).

## Alternatives

- **Keep the current no-scrubbing policy.** ADR-0017's decision was explicit and there was a case for
  honoring it — but now that all three premises behind it (user intent, one-time, transmission-only) are
  void, keeping it is closer to neglect than to honoring the original decision.
- **Mask only right before report transmission (inside `reportError`).** Covers only the send path — **the
  data that persists on the device is untouched.** Persistence is half of this risk, so this is a half
  measure.
- **Mask at buffer-append time (`dispatch`).** The strongest option, but it also hides values from the
  developer looking at the console or the debug overlay, destroying the tool's value for debugging. What
  stays local and what goes out should be held to different standards.
- **Value-pattern-based scrubbing.** Catches things with no field name too, but with high false positives,
  and there's no way to predict what got redacted, eroding trust in the tool.

## Consequences

**What is gained**

- Tokens, passwords, and credentials no longer appear as plain values, either in reports leaving through the
  shared channel or in logs sitting on the device.
- Transport and breadcrumbs now share one standard — updating `SENSITIVE_KEYS` in one place keeps both paths
  in sync.

**Trade-offs accepted**

- **A key merely containing a word like `token` gets masked even when it isn't secret.** `deviceToken` is
  the prime example — in this very session, someone actually saw that masking and mistook it for "the request
  body got corrupted." Masking only applies to the logged representation; the real request goes out
  unmodified.
- Secrets embedded inside a string still pass through — a deliberately left gap, recorded here.
- If you need the real value for debugging, check the local console or the debug overlay (the pre-masking
  buffer).
