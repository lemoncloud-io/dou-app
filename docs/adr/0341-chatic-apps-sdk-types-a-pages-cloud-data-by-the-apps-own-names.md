# ADR-0341: chatic-apps-sdk types a page's cloud data by the app's own names

> Status: Accepted · Decided: 2026-11-18 · Implemented: `feat/chatic-apps-sdk-typed-runtime`
> · Scope: `libs/chatic-apps-sdk/src/runtimeTypes.ts`, `runtime.ts`, `chaticApps.ts`, `mock.ts`, the
> package `README.md` and `docs/guide/`,
> `apps/mobile/src/app/subWebView/chaticAppsSdkRuntime.contract.test.ts`
> · Supersedes in part decision 11 of
> [ADR-0320](./0320-a-sub-webview-page-reads-the-current-cloud-through-a-whitelist-of-runtime-requests.md)
> (the SDK's untyped `apps.runtime`)
> · The module doc is the [chatic-apps-sdk README](../../libs/chatic-apps-sdk/README.md)

## Context

`apps.runtime` (ADR-0320, ADR-0325) let a mini app read its cloud and send a text message, but the
library typed none of it: a page named a method as a string, passed `unknown[]`, and got `unknown`
back. A misspelt name surfaced only at run time as `RUNTIME_NOT_ALLOWED`; the shape of a room, a message
or a member was written down nowhere a page author could read; a stream's listener had to be placed by
hand with a `LISTENER` marker; and the mock accepted answers of any shape, so a page could pass every
browser test and break in the app. The one write sat in the read API as `call('chat.sendChat', …)`.

The app's types for all of this exist, but in private workspace packages (`@chatic/bridge-messages`,
`@chatic/data`, `@chatic/runtime-core`) that a published package cannot import.

## Decision

1. **The library types the methods by the app's own names and shapes.** `DataCalls` and
   `DataStreams` list every method the sub WebView whitelist opens, under its
   `<repository>.<method>` name, with the permission that opens it, its arguments and its answer. The
   rows (`CloudChannel`, `CloudJoin`, `CloudChat`, `CloudPlace`, `CloudUser`, `CloudProfile`,
   `CloudInfo`) and the session (`CloudSession`) are the app's, field for field, contact and
   account details included and marked as such. The method names and the row fields get no mini-app
   vocabulary on top: a second set of names would be a second contract to keep in step with the
   first.
2. **The types are declared by hand in the library and held to the app's by the app's contract test.**
   The test checks, permission by permission, that the typed methods are exactly what the whitelist
   opens, and at the type level that each method's arguments are ones the app's repository method takes
   and that every row, embedded view and the session match the app's in field names, optionality and
   field types. Neither the app's jest transform nor CI type checks `@chatic/mobile`, so the test
   compiles itself with the TypeScript compiler and fails on any error in its own file.
3. **Typed calls narrow; untyped calls still go through.** A name in the map gets its argument and
   answer types; any other name answers `unknown`, so a page can call a method an app newer than the
   library opened. `call<T>(name)` with an explicit type still reaches a known method untyped, as it
   did before. At run time nothing changes for an existing call.
4. **A typed stream needs no `LISTENER`.** Every whitelisted stream takes its callback right after the
   page's arguments, which is where `subscribe` already put a missing listener, so the types give each
   stream exactly its pre-callback arguments and nothing after. No run-time table of listener
   positions is shipped. `LISTENER` stays for methods the library does not know.
5. **The write is a method of its own.** `apps.data.sendMessage(channelId, text)` sends the text
   message `chatSend` allows; `call('chat.sendChat', …)` still works. It is named for what it does, as
   the library's other calls are (`finish`, `copy`, `share`), and its parameter keeps the row's own
   `channelId`.
6. **The mock answers through the same map**, so an answer of the wrong shape fails the page's type
   check. With `chatSend` it opens the send itself, refuses a send of a shape the app refuses (not a
   room of another place, nor past the budget — those are the app's), and records each send that went
   through.
7. **Versioning while `0.x`**: a release that adds raises the minor version, one that only fixes raises
   the patch. The package README keeps a table of each release's bridge version and runtime contracts.

8. **The names a page author sees say "cloud data", not "runtime".** `apps.runtime` becomes
   `apps.data` and its capability `supports('data')` — the same name as the app's request target — the
   API's types are `Data…` (`DataCalls`, `ChaticAppsData`, `SDK_DATA_CONTRACTS`), the shapes it answers
   are `Cloud…` (`CloudChat`, `CloudList`; the cloud's own row is `CloudInfo`), and the mock's option is
   `data`. "Runtime" is the app's internal word for its data layer and means nothing to a page author.
   What crosses the wire keeps its names — the `Runtime…` request messages, the `SubWebView…` messages
   and the app's error codes (`RUNTIME_NOT_ALLOWED`) — because apps already installed answer only those,
   and renaming them would need both names in the app for as long as old apps are supported, for no
   gain a page author can see: the library hides them. A prefix was kept on the shapes because bare
   `User`, `Chat` or `Session` collide with names in an author's own code. Nothing had shipped under the
   `runtime` names, so no alias is kept.

## Consequences

- A wrong argument, or reading a field a row does not have, fails the page's build instead of failing
  in the app. A misspelt method name does not: it is taken for a method this library does not know
  and answers `unknown`, so it fails the build only where the answer is used, and otherwise at run
  time with `RUNTIME_NOT_ALLOWED` as before. That is the price of letting a page call what a newer app
  opens.
- A field the app adds, drops or retypes on a row the whitelist exposes fails the app's contract test
  until the library's declaration follows. So does a method opened or closed in the whitelist. The
  app's runtime contract suite takes about 1.6 seconds longer for the compile.
- The rows are large and mostly optional, because they are the app's cache rows unfiltered. The types
  now spell out in public what a page with each permission receives — including fields named after
  secrets on the place owner's embedded account view, which the app passes on as the server fills
  them. That is a visibility the protocol side can act on; the library documents it rather than
  filtering, since filtering is the app's to decide.
- TypeScript pages that called a typed method with arguments the app never accepted, or annotated a
  mock answer with a looser shape, now fail to compile. That is the point of the types; the explicit
  `call<T>` form remains for anyone who needs the old behaviour. The same goes for a call whose answer
  was typed only by annotating the variable it lands in: the typed answer now has to fit it.
- `apps.runtime` was never in a published release (0.2.0 predates it), so no published page breaks,
  neither from the types nor from the rename to `apps.data`.
- An error code a page branches on can still say `RUNTIME_…`: it is the app's, and the package README
  says which API it belongs to.
- Embedded views are checked four levels deep; a change deeper than that is not caught.

## Alternatives considered

- **Generate the types from the app's packages at build time.** It would remove the hand copy, but the
  published declarations would then be whatever the generator inlines from three private packages and
  two upstream API packages, unreviewed, on every build. A hand copy is reviewed once and the contract
  test keeps it honest.
- **Leave the rows untyped (`unknown`) and type only names and arguments.** Cheaper, but leaves the
  main question a page author has — what is in a room or a message — unanswered.
- **A page-facing vocabulary (rooms, messages, members) mapped onto the app's.** Friendlier names, but a
  second contract that every app change has to be translated into, and the app's answer is not filtered
  for pages anyway.
- **Keep the write in `call` only.** Writes would stay indistinguishable from reads as more are added.
