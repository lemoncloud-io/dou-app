# desktop-web-e2e

**`apps/desktop-web` in a desktop-sized Chromium window, signed in to real dev accounts, against the
dev backend.** Nothing is faked: the scenarios send real messages, create and delete a real channel,
and read what the server sends back. That is what this suite is for — the nav rail shell, the
Notifications, Channels and DM panels, Saved items and the place welcome page, checked as one
running app rather than component by component.

It is also why it does not run in CI. It needs accounts, it changes their data while it runs, and it
depends on a server outside the repository. Run it by hand before landing a change to those screens.

## Run it

1. Copy `.env.example` to `.env` in this folder and fill it in. `.env` is git-ignored — the
   credentials are real and must never be committed.
2. Run it:

    ```bash
    yarn desktop-web:e2e          # the suite (= npx nx run desktop-web-e2e:e2e)
    yarn desktop-web:e2e:headed   # in a visible window
    yarn desktop-web:e2e:headed notifications   # one file
    ```

Playwright starts `apps/desktop-web`'s Vite dev server on port 5391 (`DESKTOP_E2E_PORT` moves it),
or reuses one already there. The backend is whatever `apps/desktop-web/.env` points at, which for a
developer is the dev servers the accounts live on. Sign-in goes through `/auth/debug`, the email
sign-in a dev server offers and a build does not.

A failure leaves a trace and a screenshot in `dist/.playwright/apps/desktop-web-e2e/test-results/`
(`npx playwright show-trace <zip>` replays it).

## Settings

| Variable                                              | Needed by                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `DESKTOP_E2E_EMAIL`, `DESKTOP_E2E_PASSWORD`           | every scenario: the account they run as                                                         |
| `DESKTOP_E2E_PEER_EMAIL`, `DESKTOP_E2E_PEER_PASSWORD` | signed in by the setup, for scenarios that need a second person (none yet, below)               |
| `DESKTOP_E2E_CLOUD`                                   | the channel and welcome-page scenarios: a workspace cloud of the main account                   |
| `DESKTOP_E2E_PLACE`                                   | the channel and message scenarios: a place in that cloud where channels may be made and deleted |
| `DESKTOP_E2E_EMPTY_PLACE`                             | the welcome-page scenario: a place in that cloud with no channel or DM yet                      |

A scenario whose setting is missing is skipped, not failed.

## How a scenario starts

The `sign-in` project signs each account in once. In a browser the app keeps its session in
`sessionStorage` (the desktop shell would give it `localStorage`), which Playwright's storage state
does not carry, so the setup saves it beside the storage state under
`dist/.playwright/apps/desktop-web-e2e/.auth/`, and the `test` fixture (`src/support/test.ts`) puts it
back before the page loads. The first-run tour is closed during sign-in and stays closed.

`app` is a fresh context for the main account on `/`, with the shell drawn. Each scenario starts from
the device state sign-in left — no folded sections, no saved items, an empty inbox — and the server
state the account has.

One worker runs everything in order: the scenarios share accounts, and two of them moving the same
account between clouds at once would read each other's state.

## The scenarios

| File                    | Covers                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell.spec.ts`         | the nav rail's four destinations and account menu; each destination swaps the sidebar and keeps the room; the cloud dropdown                |
| `home.spec.ts`          | the Home sidebar's sections and folding; the empty Saved page; the welcome page and Later; searching the DM list                            |
| `messaging.spec.ts`     | text, edit and delete; a reaction; a thread reply; Save for later through the Saved page and back; the DM row's preview                     |
| `channels.spec.ts`      | create a channel, send to it, find it first in the Channels list, search it, delete it                                                      |
| `notifications.spec.ts` | the empty inbox; day groups, tabs, the unread filter and sort; opening an unread item; selection, mark read, delete; mark all read and undo |

Text a scenario writes starts with `e2e ` and ends in a time-based tag (`marker()` in
`src/support/app.ts`), so it can find its own message among real history. The message scenarios write
in a channel the `room` fixture makes for each of them in the sandbox place and deletes afterwards,
messages and all; the channel scenario deletes its own channel even when it fails. Only the DM-row
preview writes in the default cloud's notes-to-self room — the one 1:1 every account has — and it
deletes its message again. Without a sandbox place the message scenarios fall back to that room too.

The Notifications inbox is kept on the device, filled from what the socket delivers while the app
runs. Its scenarios put items into the app's inbox store themselves — through the store module, which
the dev server serves at its source path — instead of waiting for someone to mention the account. The
items point at the notes-to-self room so that opening one has a real room to go to.

## Limits

- **No second person yet.** A DM, a mention, a reply or a reaction from someone else needs both
  accounts in one place, and the two dev accounts share none. Making one means inviting the peer
  into a place, which changes that place for good, so it was left out. The peer is signed in already;
  a scenario that needs it uses the `peer` fixture and skips when no peer is configured.
- **A room whose newest messages are all deleted looks empty.** The desktop feed asks for older
  history only from the oldest message it shows, and only when scrolled to the top; when the newest
  page holds nothing but deleted messages there is neither, and the room reads as having no messages
  at all. Sending and deleting in one room run after run gets there, which is why the message
  scenarios work in a channel of their own. The DM-row preview still deletes one message per run in
  the notes-to-self room.
- **Live data moves.** Someone else using the same dev account while the suite runs can rename it or
  change its rooms. The scenarios look things up by role and name and only rely on what they made.
- **Chromium only.** The desktop app is Electron, which is Chromium; there is no second engine to run.
- **Not the shell.** This is the renderer in a browser. Electron's menus, IPC, notifications and
  window chrome are not here.

## Adding a scenario

Find controls by role and English name (the context runs in `en-US`), as a reader would, through the
helpers in `src/support/app.ts`. Wait for what the server confirms — `send()` returns a message once
the server has numbered it, because the pending copy before that is replaced on delivery and loses
whatever was done to it. Clean up what the scenario creates.
