// User issue reporting and log-batch upload — moved out of `@chatic/web-core`'s `api/` per
// ADR-0070 Decision 6 ("report transport → @chatic/runtime/http"). It belongs here because it reads the session
// (uid, role, active cloud) to describe WHO filed the report, and the session hub owns that.
//
// Automatic error reporting (`reportError`) was retired in 2026-09: errors are ordinary
// `logger.error` entries now, shipped by the batch uploader to `/hello/report-bulk`. What is left
// on `/hello/report` is the one thing the log pipeline cannot carry — a report the *user* writes,
// with its Slack ping and its photo attachments.
//
// Both are runtime-client's (its `diagnostics` group). `reportIssue` is this page's binding of it:
// the page's address and host profile are the two things that package does not read itself.
export { reportIssue } from './reportIssue';
// `redactQueryString`/`sanitizeReportUrl` are NOT re-exported: they are the payload builder's own
// scrubbers (`submitIssueReport` calls them) and no app has ever used them (ADR-0076 Decision 6).
export { uploadLogBatch } from '@chatic/runtime-client';
export type { AppType, IssueReportExtras } from '@chatic/runtime-client';
