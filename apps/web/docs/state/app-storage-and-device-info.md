# app storage, device info and the small stores — why they are shaped this way

Notes on `src/app/storage/`, `src/app/stores/` and the preference parsers. The
[stores overview](./stores.md) lists what exists; this page keeps the reasons that are easy to lose.

## The two app stores

`storage/appStores.ts` gives features exactly two stores to keep their own state in:

- `device` outlives the tab: drafts, input locks, recent emoji, push marks, the sent-invite log, the
  browser's log queue and the telemetry policy.
- `tab` dies with the tab: the pending invite channel, the log tab id, the crash sentinel and the debug
  unlock record.

A feature never names `localStorage` or `sessionStorage` itself (a lint rule enforces it); it takes one of
these two, which lets the entry point decide where state lives. The exported stores are switchable
wrappers rather than the web stores, because zustand's `persist` and a few modules (i18n) take their
storage at import time, before `main.tsx` has run. Each call goes to whichever store is configured by
then, and until `configureAppStores` runs they are the page's two web storages, tolerant of a full or
blocked one. Every zustand `persist` store names the `KeyValueStore` it writes to through
`persistStorage.ts`, because without one `persist` falls back to a direct `localStorage` write.

## Preference parsers

`@chatic/config` only checks that a `json` value parses; it cannot know a sort map must hold sort
methods. `stores/preferenceParsers.ts` applies product-shape validation to whatever the setting returns,
and to the legacy key's value during the one-time migration. They all fail towards the harmless default:

- **Channel sort map** keeps only recognised per-place values, so a corrupt entry cannot leave the picker
  with no selection. Entries keyed by a bare place id are dropped: they cannot be attributed to a cloud,
  and honouring them would leak one cloud's sort into another cloud's same-id place.
- **Folded home sections** stores the sections a person closed, not the open ones, so the default (every
  section open) needs no entry. A corrupt value degrades to all open, the state home had before this was
  remembered. Unknown ids and anything but `true` are dropped, so a retired section id cannot linger.
  The `cloudDm` section id once meant only the self chat; it is a stored key, so it kept its name instead
  of resetting everyone's folded state.
- **Recent searches** reset to an empty list on a corrupt value, so one bad write cannot break the search
  page; non-string entries are dropped one by one.
- **The cloud-promo dismissal time** degrades to 0 so the banner shows rather than staying hidden: a corrupt
  value must not suppress it for good. A timestamp in the future is treated the same way, since only a
  clock change or a bad write produces one and honouring it would hide the banner until that date.
- **The legacy theme value** accepts two shapes, the plain string this app used to write and the
  zustand-persist envelope the mobile app stores under the same native key; anything else is `null`.

## Device info

`useDeviceInfoStore` builds `DeviceInfo` from the shell's injected globals, read live on every sync, not
from the host profile's boot snapshot, because the phone runs its boot script again after load and that
second pass can rewrite the device ids and the version check. A later sync therefore also puts the
injected latest-version values back over what `updateVersionInfo` merged since; every mount of
`useDeviceInfo` does that.

- **The stage has three vocabularies.** Mobile injects the `Env` names, older installs still send
  `LOCAL`/`DEV`/`PROD`, and desktop sends `dev`/`prod`. Desktop's `dev` stays as it is on the wire,
  because the push broker's application is named after it, and is translated here. An unrecognised value
  becomes `local`, the least privileged stage, which is also the default when the global is absent.
- **`INSTALLATION_ID` is not folded into the bare device id.** Apps up to 0.15.x injected the Firebase
  installation id there, so it is not a safe source for a plain device id.
- Absent globals stay `undefined`, so `??` fallbacks downstream keep working.

## Seams and hand-offs

- **Requests from a feature to the runtime** (`useAddCloudRequest`, `useEmailBindRequest`,
  `useFindMeSheetRequest`) exist because features do not import each other. The owner raises a request,
  and a host mounted above the features (the runtime or the private shell) answers it. A cloud is created
  with no email, and its recovery email is registered from cloud management only, which is why that
  dialog is raised from a different feature than the one that owns it. None of them persist; they last one
  interaction.
- **`usePendingInviteChannel` is kept in `sessionStorage`**, not only in memory. Both accept lanes stash
  the invited room and then leave the accept screen by rewinding, and the rewind is not always a
  same-document hop: the native shell reloads the WebView when the OS kills its web process, which a person
  waiting for an SMS code in another app can easily cause. The entries behind the accept screen then belong
  to a document that is gone, so the rewind is a full page load that would take an in-memory id with it.
  The tab-scoped storage survives both, and the id is removed as soon as it is consumed.
- **`useMessageJumpStore`** keeps its nonce counter outside the store state. Deriving it from the current
  target would restart at the same value after `clear()` nulled the target, and a repeat jump to the same
  message would then not fire. A person's jump (a search hit, a notification, a mention pill) centres the
  row, highlights it and says so when it cannot get there; the room's own landing on entry puts the row at
  the top, highlights nothing and gives up silently.
- **`useChannelSyncMarkStore`** records which clouds have had their channel delta answered at least once
  this session, so an empty cache is not read as an empty cloud. A place with no rooms is common (every
  place starts that way) and must not sit through the whole cold-list window before saying so. A failed
  delta counts, since it is an answer about reachability. It is keyed by cloud and account, so a second
  account signing in during the same session waits for its own answer. The place list has no equivalent
  mark on purpose: an empty place snapshot is discarded without being written, so a completed refresh
  cannot testify that a cloud has no places. Re-marking the same scope is the common case (every poll
  tick and foreground return), and the store returns its previous state then so nothing re-renders.
- **`useNotificationStore` clears on sign-out.** Its overlay belongs to the signed-in person and is
  registered as a sign-out callback, so the next account never opens onto it, and what was cached before
  that account signed in is not news to it. Its older snapshot keys are removed once per launch.
- **`useBottomNavSuppression`** lets a tab screen take the bottom nav away for a moment (the notifications
  tab while selecting, whose action bar takes the nav's place). The layout that draws the nav reads it;
  the screen sets it and clears it again when the moment ends or the screen goes.
