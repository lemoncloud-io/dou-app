# ADR-0145: iOS asks for the system upload progress only once a transfer has run for 3 seconds

> Status: Accepted · Decided: 2026-09-30
> · Scope: `apps/mobile/ios/Bridges/Transfer/TransferSessionOwner.swift`
> · The module doc is [apps/mobile file-transfer.md](../../apps/mobile/docs/native/file-transfer.md#notifications)

## Context

On iOS 26 and later the native transfer module asks for a continued-processing task
(`BGContinuedProcessingTask`) as soon as a transfer starts. The task keeps the app awake while it is in
the background, so progress callbacks keep arriving, and the system shows them in its own progress UI
with a cancel control.

That UI arrives with a haptic and a banner, and every upload asked for it — including a chat photo
that is resized, uploaded and sent in well under two seconds. People noticed the phone buzzing each
time they sent a photo or a file, and read it as the app vibrating on purpose. Nothing in the web or
the shell asks for a vibration; the system does, for the UI we requested.

The bytes themselves do not depend on the task. They move through the background `URLSession`, which
the OS carries on with whether or not the app is awake.

## Decision

**The owner asks for the task only if something is still running 3 seconds after a start**, and only
if the app is still in the foreground then. A start while a task is already pending or active joins
it, as before.

Three seconds is a measure of what a quick send takes: a resized chat photo is a few hundred kilobytes
to a few megabytes, which clears inside that on an ordinary connection. A transfer still going at
that point is one long enough to be worth watching.

## Consequences

- **A quick send is silent.** No task, so no system UI, so no haptic or banner.
- **A long transfer still gets the UI**, 3 seconds late, with its haptic. That buzz is the system's
  announcement of a UI a person may want, not noise on every send.
- **Leaving the app inside the first 3 seconds loses the UI for that batch**, because the system only
  accepts the request from a foreground app. The transfer itself is unaffected — it finishes through
  the background session and its result is delivered as it always was. A batch that fails while the
  app is away still leaves its one local notification.
- **Nothing to test off device.** The simulator refuses continued-processing tasks, so this is checked
  on an iPhone running iOS 26.

## Alternatives

- **Drop the task.** Rejected: the progress UI and its cancel control are real value for a large
  upload, and the change would take them away to fix a problem only short uploads have.
- **Let the web mark a transfer as quiet** (a flag on `StartFileTransfer`). Rejected: the web cannot
  know how long an upload will take any better than a timer can, it would need a web and an app
  release to agree, and a quiet transfer that turns out slow would have no UI at all.
- **Ask when the app moves to the background.** Not possible: the request has to come from a
  foreground app acting on a person's request, and the moment of leaving is neither.
