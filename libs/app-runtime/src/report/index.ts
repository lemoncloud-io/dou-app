// User issue reporting and log-batch upload — moved out of `@chatic/web-core`'s `api/` per
// ADR-0070 결정 6 ("리포트 전송 → app-runtime/http"). It belongs here because it reads the session
// (uid, role, active cloud) to describe WHO filed the report, and the session hub owns that.
//
// Automatic error reporting (`reportError`) was retired in 2026-09: errors are ordinary
// `logger.error` entries now, shipped by the batch uploader to `/hello/report-bulk`. What is left
// on `/hello/report` is the one thing the log pipeline cannot carry — a report the *user* writes,
// with its Slack ping and its photo attachments.
export * from './reportIssue';
export * from './reportUrl';
export * from './logBatch';
export * from './types';
