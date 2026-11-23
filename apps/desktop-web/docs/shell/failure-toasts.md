# Failure toasts

A failure toast leads with a sentence the person can act on and puts the failure's own words under
it: `toastFailure(title, error)` (`src/app/shared/utils/failureToast.ts`). The words come from
`serverErrorText` (`src/app/shared/utils/errors.ts`) — the backend's body when it answered, else the
error's message. An error that wraps another (the socket SDK's `AuthSwitchError`, whose message is
only the stage, `auth.switch failed: server`) gets the wrapped error's text appended after a dash,
so the server's refusal is on screen instead of hidden in `cause`. A body that is markup (a proxy's error page) is dropped, and anything past 300
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

Status codes match as whole numbers only, because the text carries ids such as `channels/U:1000404`.
The order matters where one text carries two signals: an expired invite is also reported as invalid, and
a wrong code arrives as `400 INVALID … (not-found)`, so the specific kinds are tested first and a bare
400 last. Callers map the kind to a sentence of their own and keep the raw text for the log.

## Reading a status from a rejected request

`socketErrorStatus` returns the status a rejected socket request carries, or `undefined`. A numeric
`errorCode` on the error comes first: the socket library drops the server's code when it rejects, and
`@chatic/runtime`'s socket manager puts it back on every request made through it. That is the only source
of a status for a refusal whose message does not lead with one (a parameter check is coded 400 with
nothing in front). Otherwise the status is read from the message prefix (`403 FORBIDDEN - …`, and the
client's own `503 …` / `408 …`), never from the wording after it. Use it where one status means one
thing and the wording is not a contract: the phone sign-in's wrong code and expired code differ by
status alone. The same convention is in `@chatic/runtime` and in `apps/web`'s `getSocketErrorCode`; a
change to it belongs in all three.

`serverErrorText` follows wrapped errors a bounded number of levels, so a cyclic `cause` cannot loop.
