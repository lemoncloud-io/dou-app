# miniapps — the mini app tab and the owner's management screen

`apps/web/src/app/features/miniapps` is the mobile web's top-level mini app tab: the hub first, then
the open cloud's mini apps as its server keeps them, and a screen where the cloud's owner adds, edits,
turns on and off, and removes them. It reads and writes the list through `CloudRepository`'s
`listMiniApps` · `addMiniApp` · `updateMiniApp` · `removeMiniApp`, which go over the socket to the
connected cloud (`@chatic/data`'s [mini app](../../../../../libs/data/docs/remote/socket.md#mini-app)).

## Layout

```text
features/miniapps/
├── index.ts                   MiniAppRoutes, for PrivateRoutes
├── routes/index.tsx           /miniapps and /miniapps/manage, behind the toggle
├── pages/
│   ├── MiniAppsPage.tsx       the tab — /miniapps
│   └── MiniAppManagePage.tsx  the owner's list — /miniapps/manage
├── components/
│   ├── MiniAppSheet.tsx       add / edit / remove, with the save errors under their fields
│   ├── MiniAppConsentDialog.tsx  the first-open question for a site DoU does not run
│   └── MiniAppParts.tsx       the initial tile, the off / on hold chip, the host under a name
├── hooks/
│   ├── useCloudMiniApps.ts    the list query, who owns the cloud, the three writes
│   ├── useMiniAppOpener.ts    opening the hub and a mini app, the consent, the hub's result
│   └── useMiniAppEditor.ts    the owner's sheet: what it edits, what a save sends
├── utils/saveError.ts         a refusal → its field and message
└── testing/setup.tsx          the page tests' router + query client harness
```

## Behind a toggle

Everything here sits behind `feature.miniApp.tab`: off by default and on for local and development
builds only, so a production build is exactly as it was — three tabs, no routes, and the Lab's mini
app card.

- **The tab.** `BottomNavigation` adds mini apps as the second tab (chat · mini apps · notifications ·
  MY), and `UnifiedLayout` adds `/miniapps` to the paths that show the nav. Both read the toggle; the
  nav is drawn by the layout's path list, so the two always change together.
- **The routes.** `miniapps/*` is registered in `routes/PrivateRoutes.tsx` whatever the toggle says,
  and the routes read it themselves: with it off, any address under `/miniapps` goes home. Hiding only
  the tab would leave the screens one typed address away.
- **The Lab card.** While the toggle is on, `LabPage` leaves the launcher out of its mini app card,
  which keeps only DoU's own pages (Raise DoU, Closer Word, Sky 45). It reads the setting only; one
  feature does not import another.
- The toggle's `persist` is `session`: one turned off from the debug panel comes back at the next
  session.

## The tab — `/miniapps`

- **The header** is the title, and for the cloud's owner a button (labelled "Manage mini apps") to the
  management screen.
- **The hub row** opens DoU's hub for the cloud. The hub is handed the **active** mini apps only, as
  each one's id, name and host — never an address, and never one its owner turned off or an admin
  holds.
- **The list** is headed by the cloud's name and how many rows it shows. A member sees the active
  mini apps; the owner sees every one in the server's order, the ones members do not see marked
  **Off** (grey) or **On hold** (red) before the name, with a note that members do not see them.
  Each row is a tile with the name's first character, the name and the address's host.
- **Pressing a row** opens an active mini app. For the owner, a row that is off or on hold opens its
  edit sheet instead: there is nothing for anyone to open.
- **States.** While the list loads, two placeholder rows; when it cannot be read, a line and **Try
  again**; an empty list says so differently to a member (the owner adds them) and to the owner (with
  **Add a mini app**, which opens the add sheet here).
- **The Default Cloud** (Home) is the relay's, with no owner and no list: the tab shows a member's
  empty list there, and asks the relay nothing.
- The list query is keyed by the cloud (`[...cloudsKeys.detail(cloudId), 'miniApps']`) and re-read
  each time the tab opens (`staleTime: 0`), so a change made on another device shows on the next
  visit. A switch never shows the previous cloud's rows for a frame: their key is a different query,
  and pressing such a row would open it with the new cloud's params.

## Opening — the same rules as the Lab card

`useMiniAppOpener` keeps the Lab card's rules, copied here rather than shared: the card still runs in
production, where its code is not to change. Both go when the tab opens in production and the card is
deleted.

- The trust tier is the shell's (`subWebViewTrustOf`), the page is opened with `openSubWebView`, and
  its params are `buildMiniAppLaunchParams` — the hub gets `isOwner` and the active list, any other
  page neither.
- **A site DoU does not run** (`external`) is asked about the first time: "Open the '<name>' mini app?
  This mini app receives your name and your details in this cloud.", Cancel or Open. A yes is kept
  per account and host under the Lab card's own key, `dou.miniAppConsent.<accountId>.<host>`, so a
  site agreed to in either place is not asked about again, and another mini app on the same host is
  not asked about at all.
- **The hub's result** counts only for the view this screen opened on it, and only while the same
  cloud is open. `openMiniApp` is looked up among the active mini apps by id, so the hub can only
  name one members may open. `openMiniAppLinkSettings` takes the owner to the management screen with
  the add sheet open (location state `{ add: true }`).
- One open at a time; switching clouds drops a consent question still waiting, so agreeing cannot
  hand one cloud's site the next cloud's names.
- An older app that opens the page in the OS browser (`outside`), and a failed open, are said in a
  toast. The tab does not hide itself on such an app.

### Details that are easy to break

- **The consent question is cleared while rendering, not in an effect.** It is held with the cloud it was
  raised in, and a render for another cloud drops it. An effect would leave one commit in which the previous
  cloud's question is still up, and agreeing in it would hand that site this cloud's names.
- **The user the page is told about is the person in this cloud.** The id comes from the session for the open
  cloud, never another's, so a page cannot receive one cloud's uid labelled as another's. The session's name
  for the person ignores its stand-ins (the runtime's `Unknown` and a guest's UUID), and a session with no id
  for the person in this cloud yet fails the open with a message instead of doing nothing.
- **The hub's close is remembered only for a hub this screen opened.** The view id and cloud are set when the
  open's reply arrives (the shell answers as it adds the view, before the page has loaded, so the hub cannot
  close and hand a result back before this runs), and only for the shell's own hub. The latest list and
  cloud are copied into refs after each commit, never while rendering, so a render React throws away cannot
  leave its own cloud and list behind for the hub's answer; the result is read through a ref rather than
  re-subscribing on every change. A host with no sub web view opens the hub in a tab, which never reports a
  close, so there is nothing to hear.
- **A hub that closes after a cloud switch answers for a cloud no longer open**, so nothing happens; a hub that
  closes asking to add a mini app before the catalog has named the person the owner opens nothing.
- **The edit sheet keeps what it last showed while it slides away.** Its content stays mounted during the
  close animation, so it keeps that mini app (or the blank add form) until then instead of turning into
  another form on its way out; the form is keyed by what it edits, so each opening starts from that mini app
  on its first paint.
- **The sheet's rules are the server's.** The name and address are checked with the same rule the server applies,
  so most mistakes are caught before a round trip, and there is no confirmation on delete because the list is
  the owner's and a removed one is quickly added again.

## The owner's list — `/miniapps/manage`

- **Who may be here.** The cloud's owner, read from positive evidence only: the cloud is in the
  account's owned catalog. Until the catalog has answered the screen waits, so an owner is not
  bounced; once it has, anyone else is sent back to `/miniapps`.
- **The list card** is headed "<cloud>'s mini apps" and "n / 10". Each row is the name (with its chip),
  the host, and a switch for whether members see it. The switch sends `updateMiniApp(id, { enabled })`;
  it shows the asked-for state and takes no other press while the change is out — it stays
  focusable, and the row says it is busy (`aria-busy`), so focus is not dropped mid-toggle — and a
  refused change falls back and says "Couldn't change it". A held mini app's switch is locked off and says why. Pressing
  the row opens its edit sheet.
- **Add a mini app** ("Up to 10") is drawn while the cloud has fewer than 10.
- **Every write that succeeds is written into the list query from its answer** — added to the end,
  replaced by id, or dropped — rather than reading the list again. A write first cancels a read of the
  list still in flight, which would otherwise land after it with the list as it was.
- **The hub's "add a mini app"** arrives as location state `{ add: true }`: the add sheet opens once
  the owner is known and the list has room, and the state is taken off the history entry as it is
  used, so going back to that entry does not open it again.

## The sheet

Add or edit: the name, the address, and **Show to members**; editing adds **Delete mini app**, which
removes at once, without asking (as the Lab does). A held mini app says at the top that an admin holds
it, and its switch is locked. An edit sends only the fields that changed, and never a held mini app's
switch.

Before sending, the sheet checks with the shared `checkMiniAppLink`, the rule the server applies too.
A refusal from the server is read with `miniAppSaveProblemOf(error)` — never `instanceof`: where the
shell's runtime owns the session the error arrives across the bridge as a plain `Error`, and the
helper reads the `name` and `code` that survive that. The message goes under its field:

| Reason        | Field   | Message                                                        |
| ------------- | ------- | -------------------------------------------------------------- |
| `nameMissing` | name    | Enter a name.                                                  |
| `nameTooLong` | name    | Names can be up to 30 characters.                              |
| `invalidUrl`  | address | Enter an https address without a port or sign-in details.      |
| `hubUrl`      | address | The mini app home opens on its own. Enter a different address. |
| `tooMany`     | address | Each cloud can have up to 10 mini apps.                        |
| `notAllowed`  | address | Only the person who added this mini app can change it.         |
| anything else | address | Couldn't save. Please try again.                               |

`notAllowed` is the cloud server refusing a change to a mini app someone else added. The screens
still treat the cloud's owner as the one who manages the list, so an owner who is not an admin on
the cloud server can meet it on another person's mini app. Deleting still says "Couldn't delete the
mini app" and the switch "Couldn't change it", whatever the reason.

The copy says the list is seen by everyone in the cloud — never "kept on this phone", as the Lab's did.

## Not here

- The desktop web, which keeps the cloud's single mini app link (`fetchMiniAppUrl` / `saveMiniAppUrl`).
- The native shell: the tab is web. It is not hidden by the shell's `subWebViewOpenScope`.
- Removing the Lab card, its launcher, or the lists kept on phones (`dou.miniAppLinks.<cloudId>`):
  this tab neither reads nor writes them, and they go when the tab opens in production.
- Reordering, icons of their own, and search.
