# Failure toasts

A failure toast leads with a sentence the person can act on and puts the failure's own words under
it: `toastFailure(title, error)` (`src/app/shared/utils/failureToast.ts`). The words come from
`serverErrorText` (`src/app/shared/utils/errors.ts`) — the backend's body when it answered, else the
error's message. A body that is markup (a proxy's error page) is dropped, and anything past 300
characters is cut.

The raw text used to reach only the console. A refusal such as
`400 INVALID - grace-timeout by invite[910024]` then showed as a sentence with no reason behind it,
and whoever reported it had nothing to quote. The sentence still leads, chosen from the failure's kind
(`classifyWireError`), so the wire text is never the only thing a person reads.

## Dialogs

A dialog that fails stays open and keeps its own inline line; the toast is raised as well. An error
toast raised while a modal dialog is open rises over the dialog's dim (`layering.md`), so the toast
is readable where the person is looking. The two say the same sentence, which is deliberate: the
inline line stays with the dialog, the toast stays after it closes.

The invite flows (`JoinWithInviteDialog`, `InviteLoginPage`) and `SendInviteDialog` also show the raw
text inline, under the sentence.

## Classification

`classifyWireError` reads a text that leads with a status as the server's answer: its wording is
never a connection failure, so `400 INVALID - grace-timeout …` reads as invalid, not network. Only
the statuses that mean nothing answered in time — 408, 502, 503, 504 — read as network.
