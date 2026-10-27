# ADR-0234: A share from another app is composed in the app, not in the share sheet

> Status: Accepted · Decided: 2026-10-26
> · Scope: `libs/app-messages/src/types/model/share-intake.ts` · `apps/mobile` (share intake: the iOS
> Share Extension target, the Android `ACTION_SEND` intake, `ShareIntakeBridge`, `shareIntakeHandlers`)
> · `apps/web/src/app/features/share/**` · `apps/web/src/app/bridge/shareIntake.ts`
> · The module docs are [share-intake.md](../../apps/mobile/docs/native/share-intake.md) and
> [feature/share](../../apps/web/docs/feature/share/README.md)

## Context

Dou was not a target in the OS share sheet on either phone. Getting a photo or a document from another
app into a room meant leaving that app, opening Dou, opening the room and finding the file again in
the attachment picker.

The reference people asked for is Slack's: pick "Slack" in the share sheet, and a sheet over the other
app shows the workspace, a searchable "To:" list of channels and DMs, a message field and a preview,
and sends without ever opening Slack.

Dou's phone app is a native shell around a WebView. Everything that would fill that sheet lives inside
the WebView's web client: the session tokens (WebView storage), the destination lists (the web's cache
and its cloud-scoped observers), the sockets the send rides, the upload sequence and the attachment
rules. The shell holds none of it; its own rule is that it renders chrome and never product content.

## Decision

1. **The OS side only receives.** The iOS Share Extension and the Android `ACTION_SEND` /
   `ACTION_SEND_MULTIPLE` intake copy what was shared out of the other app's hands and into the shell's
   `attach-pick` folder — the one folder the upload, the video conversion and the day-old sweep already
   accept. Android copies there as the intent arrives; the iOS extension runs in its own process and
   copies into an App Group inbox, which the app moves into `attach-pick` when the web first asks. Both
   open the app on
   `<scheme>://share?id=<id>`. Neither renders a destination or makes a network call.
2. **The deep-link pipeline carries it.** That URL resolves to the web path `/share?id=<id>` and
   reaches the web as `OnNavigate`, with the cold-start buffering every other link already has. No new
   push event.
3. **The web composes and sends.** The `/share` page asks the shell for the items by id
   (`FetchShareIntake`), shows the cloud, a searchable multi-select of the active cloud's rooms (every
   place, 1:1s and the notes-to-self room), a message field and the items, and sends through the same
   `useSendImages` and chat send a room uses. `ReleaseShareIntake` forgets the share afterwards.
4. **Another cloud is reached by switching to it**, through the same switch the cloud sheet uses. The
   page does not send into a cloud whose session is not the active one.

## Alternatives

- **Compose inside the share sheet, as Slack does.** Rejected: the extension would need its own copy
  of the session (tokens moved into a shared keychain), its own reads of clouds, places, channels and
  profiles, and its own upload and send — in Swift and again in Kotlin, beside the web's. Two more
  implementations of the send that drift from the one every room uses, for the one benefit of not
  leaving the other app.
- **A WebView inside the extension.** Rejected: an extension's WebView does not share the app's web
  storage, so it starts signed out; and an extension is held to a memory ceiling that a full web client
  plus a video upload does not fit in.
- **Send to another cloud in the background, without switching.** Rejected for now: a cloud off screen
  can be written to only while its background session holds a bound socket, which is capped and not
  guaranteed, and a failure there would be invisible to someone who is looking at a different cloud.

## Consequences

- Sharing takes the person into Dou. That is the cost of decision 1; it is also where they see the
  message land and can retry it if an upload fails.
- Sending to N rooms uploads the files N times: there is no server-side forward.
- The iOS extension opens the app through the responder chain, which is not a public extension API. If
  an OS release refuses it, the extension says so and the copies wait for the sweep; the share is not
  recovered on the next launch.
- A new request pair is decided in every shell: the phone answers it, the desktop lists it as a phone
  surface. The web ships first and treats `NOT_FOUND` as "nothing to share".
