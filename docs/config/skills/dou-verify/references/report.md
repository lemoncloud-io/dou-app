# Verification report

File name `verify-report-<topic>.html` (the Stop hook matches `verify-report`), written to the scratchpad and
published as an artifact. Never committed.

Sections:

1. **Verdict** — one line: verified, partly verified, or not verified, and the branch and commit.
2. **What changed** — the affected projects (`npx nx show projects --affected --base=origin/develop`) and one
   sentence per change.
3. **Methods chosen** — a table: method, why it fits this change, what it would have caught.
4. **Runs** — per run: the exact command, exit code, duration, and the lines of output that matter. Failures
   first.
5. **Evidence** — screenshots (embedded as `data:` URIs or uploaded assets), each with a caption saying what
   to look at. A screenshot nobody described is not evidence.
6. **Not checked** — everything the chosen methods cannot see (a real device, prod data, push delivery), and
   any project `verify.yml` excludes from CI.

Keep it to one page. Raw logs go behind a `<details>` element, not in the main flow.
