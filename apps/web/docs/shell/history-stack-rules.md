# History stack rules — the reasoning behind `app/navigation/`

> Scope: `apps/web/src/app/navigation/`. [routing.md](./routing.md) lists the files and what each owns;
> this page records why the rules read the way they do, so a change to one does not reopen a bug that
> was already paid for.

## Which feature graphs exist

`featureGraph.ts` names the features that are a small graph of screens about **one** instance — a
channel (room, settings, invite, threads) and a place (its detail and settings pages). Moving from one
instance of a graph to another instance of the same graph puts the first one's screens away as a unit.

- The list is short and explicit on purpose, not a general `/:feature/:id/*` rule. A general rule
  would sweep in `/invite/:inviteId/waiting`, which looks identical but is a single screen; treating a
  second invite as "another instance" would delete the first one while the reader is still using it.
- `/channels/start-dm` (the 1:1 picker) shares the channel prefix but is about no channel, so it is no
  instance of the graph. Read as one, entering a room from it would be "another channel".
- A feature that is not instance-scoped (`/mypage`, `/search`, `/subscription`) has no graph and gets
  no special treatment: collapsing them would delete a screen the reader chose. The room-entry rule
  once read "anywhere but home", and a push tapped from `/mypage` deleted My Page.
- Counting how much of the stack belongs to a graph stops at the first entry outside it and at the
  first `null`. A `null` is an entry the tracker never observed (below where a reload landed); it is not
  evidence of anything, and stopping there errs towards rewinding too little. Entries above the cursor
  are a forward branch the next push discards, so they are not counted.

## Entry rules (`stackPolicy.ts`)

The table answers only for entries from outside the user's own tapping: a deep link, an auth
transition, a push, and an eviction. Ordinary in-app movement calls `navigate` directly; `in-app`
exists so that "no policy applies" has a name. The first matching rule wins.

- **Already there** is checked first, for every kind, on pathname plus query. A matching pathname
  with a different query is a real move: invite deep links land on `/` carrying their payload in the
  query, and skipping them swallowed the invite when the reader was at home. The fragment never names a
  different screen.
- **Push** collapses the whole graph when it lands in another instance of the one the reader is
  standing in; otherwise it replaces a room (rooms are peers a push hops between, so repeated taps
  cannot stack `[home, roomA, roomB, …]`) and pushes everywhere else.
- **Deep link** heading into `/s`, `/i` or `/invite/accept` replaces: those are redirect hops the
  reader passes through, and they must leave no entry behind. Leaving the invite path rewinds onto the
  screen the reader was on before the link arrived when there is one underneath (a warm entry), and
  overwrites the acceptance screen with the destination when there is not (a cold entry). A link that
  lands in another channel collapses the one being stood in, before the rewind rule, which only steps back
  one entry.
- **Auth transition** is always _leaving_ login. It rewinds onto the screen that sent the reader to
  login, and with nothing behind (a fresh WebView load, a deep link, a reload) falls back to the
  target. Entering login is not routed through this table: `useNavigateToLogin` is the only thing
  allowed to name the login route, because it attaches `returnTo`, and it pushes, which is what makes
  this rewind land on the right screen. The two halves are a pair.
- **Eviction** (the app moving the reader off a room they are no longer a member of) overwrites the
  dead screen either way; the question is with what. When the destination is the entry directly
  underneath — a push tap pushed the room above the home the reader was on — replacing would leave
  two copies of home and the first back press would appear to do nothing, so it rewinds instead.
  Only the pathname can be compared (the tracker keeps nothing else), so a destination with a query
  is never confirmed as the entry underneath. The reverse is not guarded: a home underneath that still
  holds an invite query (onboarding keeps `/?provider=invite…` while it runs) would be rewound onto
  and run the invite again. That needs a room pushed above onboarding and is left.
- An unreadable depth never produces a rewind. Rewinding to a place that cannot be located is the one
  outcome worse than not rewinding, so such an entry falls through to a replace.
- A graph collapse rewinds `steps` entries and then **pushes**, not replaces: after the rewind the
  cursor sits on the screen the reader entered the graph from, which they chose.

## Executing a rewind (`useStackNavigate.ts`)

- `history.go` is asynchronous and signals completion only through `popstate`, so the two halves of a
  collapse cannot be issued together — pushing in the same tick would push onto the entry still being
  stood on and leave the graph in the stack. The push waits for `popstate` plus one animation frame, so
  the router has finished with the pop first.
- `popstate` never fires when there was nothing to rewind, so a 300 ms ceiling pushes anyway.
  Otherwise the tap would silently do nothing. A same-document pop lands in a frame or two.
- The location is read from `window.location`, not `useLocation`: callers arrive after awaiting cloud
  and site switches, by which time a captured location can be several screens stale, and the policy's
  first rule compares against exactly this value.
- The reconstructed stack is only passed to the policy while every transition carried a readable
  index. Once one did not, the reconstruction has a hole of unknown size and the rules that read it
  fall back to their single-entry behaviour.

## Depth and back (`stackDepth.ts`, `useStackBack.ts`)

- Depth is the router's own `history.state.idx`, never `window.history.length`, which only grows for
  as long as the WebView lives and so says "yes, you can go back" on the app's first screen. An
  unreadable index means something called `history.pushState` past the router, and the answer is
  "cannot go back".
- A rewind that plays a page transition moves a frame or more after it is asked for. Rewinds that
  have started but not landed are subtracted (`noteRewindStarted`), so two quick back presses cannot
  both read index 1 and step out of the app. Each `popstate` settles one pending rewind, and a rewind
  that never lands stops counting after 1 second, so back cannot refuse forever — a refusal is read by
  the shell as "the app is done with back" and may close the app.
- After a full reload that lands mid-stack the index survives in the entry's state but the entries
  behind it belong to a document that is gone, so going back is a real page load (a boot and a white
  flash). That is accepted: the shell reloads the WebView on resume and on update, and the alternative
  is a back button that does nothing on every screen after a reload.
- `useStackBack` returns `overlay-closed` even when a dialog refuses the press (a dialog marked
  `data-prevent-back-close`): the overlay layer consumed the press, and answering "not consumed" would
  tell the shell it may exit while a dialog is up. Whether an overlay is open is passed in rather than
  detected, so this module need not know the UI library's open-state attributes.
- `backIsTheAppsToSpend` and `not-consumed` come from one expression. They were once computed
  apart, and the drift left back doing nothing on the app's first screen after a sign-in by code.

## The tracker (`stackTracker.ts`)

- The tracker is rebuilt from the router's index and each transition's action. The router notifies its
  subscribers **before** it writes the new history entry, so a PUSH is seen while `history.state.idx`
  still holds the previous entry's index — hence `+ 1`. A REPLACE keeps the index it overwrites; for a
  POP the browser has already moved, so the readable index is the destination.
  `stackObserver.integration.test.ts` drives a real router so that a react-router upgrade that
  reorders those two steps fails loudly instead of leaving every displayed depth off by one.
- An unknown action is read as POP: it is the one action that changes nothing about the stack's
  shape. Guessing PUSH would discard the forward branch.
- Landing above the known depth marks the entries below as unknown (`null`) instead of renumbering
  the landing entry to 0 — it says "there is more behind you than this list shows".
- The array has no cap. The browser bounds the real history, and capping would have to drop from the
  front while the index is the array position, so an offset would make every displayed depth wrong.
- Like the route trail, it stores **pathnames only**: query strings carry capability tokens
  (`/invite/accept?…`, `/s?…`), and keeping the rule means the store can never leak by being wired
  into a report later.
- The trail and the stack answer different questions. `/a → /b → back → /c` leaves a trail of `a, b, c`
  and a stack of `a, c`. The observer subscribes to the data router (not a `useLocation` runner)
  because `AppRuntime` and the debug overlay sit above `RouterProvider`.

## Retiring the in-app push banner (`stackObserver.ts`, `ui/transientUi.ts`)

A transition retires the foreground push banner when the screen the banner was about is gone.

- A POP always does — that was the reported symptom: going back left the banner sitting there.
- A PUSH or REPLACE does when the pathname changes (a redirect chain ends in a REPLACE onto a
  different screen). A REPLACE onto the same pathname does not: that is a query being normalised or
  a filter being written to the URL, and dismissing would eat a banner that arrived a moment ago.
- The first recorded location does not, because nothing can have been raised yet. It is recorded as a
  POP so it lands on the index the tab is already at without a `+ 1`.
- The navigation module owns _when_ and knows nothing about toasts; `ui/transientUi.ts` owns _what_.
  The dismissal is `toast.dismiss(IN_APP_PUSH_TOAST_ID)`, never a bare `toast.dismiss()`: clearing
  everything would take out the confirmation or error toast of the action that caused the navigation.
  The cloud-activation banner is left alone — it reports an account event, so moving screens does not
  make it stale. Registration happens from the hook that raises the banner, not at import time, so a
  test that merely imports the module does not leave a listener behind.
