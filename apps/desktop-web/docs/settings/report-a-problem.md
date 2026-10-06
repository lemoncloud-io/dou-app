# Report a problem

Settings has a way to send the team a problem: the "Report a problem" button in the About section
opens `ReportIssueDialog` (`features/settings/components/ReportIssueDialog.tsx`).

## What it sends

A title and a description, both required (blank or whitespace-only text cannot be sent). They go out
through `runtime.report.reportIssue`, the same call the web feedback screen uses. That call adds who
sent it, the active cloud, the page address and the environment; the dialog adds whether the browser
is online, the window size and the current path. There are no attachments. Titles stop at 100
characters and descriptions at 5000, so an unbounded paste cannot fail the whole submission at the
server.

## What the person sees

- While sending, the fields and both buttons are disabled and the button reads "Sending..."; the
  dialog cannot be dismissed.
- On success the dialog closes and a toast says the report was sent.
- On failure the dialog stays open with what was typed and shows an error line. The failure is also
  logged. Nothing is swallowed, so a report is never lost silently.

## Known limit

`reportIssue` labels the sender "web" unless the app is native or the project name contains
"admin", so a report from this app is not told apart from one sent by the web app itself.
