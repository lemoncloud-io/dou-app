# Checkout and session contracts

## How the HTTP port reads the server's refusals (`errors.ts` in `@chatic/checkout-web`)

- A `403` is a lost session, except `main user only` (a guest account: `notAllowed`, the reader stays signed in) and,
  on the two calls that charge (the checkout's start and an upgrade), a message containing `INVALID PAYMENT`, which is a
  declined card and becomes a failed attempt. Any other `403` on those calls is not a card problem; reading it as one
  would send the reader back to the card window for nothing.
- `400` and `409` are both `conflict`: the server refusing what the state allows. A `409` on an upgrade can also be the
  server unsure whether the difference was paid; the plan is unchanged then and the screen says the change cannot be
  made now.
- A session the server refused stays refused for that page load (`lost`). The stored credentials are still in storage,
  so without it the sign-in page would see a session and send the reader straight back.

## The sign-in return

- The callback page starts the exchange once per mount. The sign-in record is spent by the first exchange (a second
  would report an expired sign-in) and React's development double effect would otherwise run it twice.
- The return is refused as expired when the record is missing, the `state` does not match the attempt's nonce, or more
  than ten minutes passed. A code shorter than six characters is the OAuth relay reporting a failure in the code's
  place, and reads as a canceled sign-in.
- A failed round trip still carries the path it was going to (`detail.next`), so trying again goes there too.
- The relay appends its code to the return address as it is given, so the address is not URL-encoded; the nonce is plain
  letters and digits.
- The "no linked account" page gets the masked address through the history state, not the query: it is still a piece of
  the reader's email, and a URL is copied, logged and shared.
- Signing in clears every cached answer (all query keys start with `subscription`), since a different account may have
  signed in.

## The checkout

- Once the card window has registered a card for this checkout, trying again goes straight to the charge with that card.
  Reopening the window would register (and with a real provider, authorise) another one.
- The jump from the card step to the payment status page replaces the history entry, so Back does not land on a payment
  form that is already paid.
- A success call that answers with a subscription the port cannot read is followed as `processing`, so the next read of
  the subscription decides, instead of being reported as a declined card.
- Query defaults: port errors are answers (a conflict, a limit) and are never retried; an answer stays fresh for a
  minute.

## The lazy port (`lib/port/http/index.ts`)

- A failed chunk load is forgotten so the next call tries again; the chunk can be missing for a moment after a deploy.
- A failed runtime start is not forgotten: it stays failed for the page, so a port whose start failed fails again until a
  reload.
- The port is made before the session host renders, so the runtime has started before the host reads it.

## Card entry details

- The dollar provider's card dialog is not modal because the card's own security check opens over the page outside the
  dialog and must take clicks. Radix mounts different content for a modal and a non-modal dialog, so `modal` is fixed for
  the dialog's life: switching it would remount the card field.
- If the dialog closes while the provider's script or the field is still loading, what arrives afterwards is taken away
  at once. A reader leaving the account surface ends the pending request as a closed window, so its caller is not left
  waiting; that check runs a moment later because a development build mounts every effect twice on purpose.
- The provider's card errors are reported by kind only: its error object can carry the setup intent, client secret
  included.

## Back button

A page opened straight from a link has nothing behind it (the router gives its first history entry the key `default`),
so the back button goes to the plans instead (`useGoBack`).
