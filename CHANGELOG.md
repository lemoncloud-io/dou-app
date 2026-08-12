# Changelog

## [2026-08-12] - root@0.52.0, @chatic/web@0.45.0

### Features

- (web-core) report what a failed request sent and what came back
- (admin-v2) symbolicate a report's stack, and catch admin's own errors
- (scripts) resolve a report's stack to source with one command
- (build) emit source maps everywhere and keep them out of the public bucket
- (web) widen error capture and persist the log buffer
- (web/debug) gate the hidden debug overlay behind an entry code
- (web-core) make an error report say what broke, where, and in which build
- (bridges) route report breadcrumbs through a LogSource
- (logger) unify the logging contract and preserve occurrence time

### Bug Fixes

- (app-runtime/socket) stop recording a request failure twice
- (web) hold the profile refresh until the socket is verified

### Refactor

- (data) send cache failures to the logger instead of the console
- (mobile) move logging onto the shared core and report native crashes

### Other

- ci: (deploy) pass the debug entry code through to the build

## [2026-08-11] - root@0.51.0, @chatic/web@0.44.0

### Features

- (admin-v2) show report attachments in the detail drawer
- (web) let feedback reports carry screenshots
- (web-ui-kit) add a photo attach field
- (web) replace the floating issue-report widget with a 의견 보내기 page
- (web-ui-kit) restyle the floating tab bar to the current bottom nav design
- (web-ui-kit) add a Textarea foundation for long-form input

### Bug Fixes

- (web/feedback) frost the notch strip above the feedback header
- (web) give the update banner its missing version strings

### Documentation

- (web/feedback) document photo attachment in the feature doc
- (adr) record how feedback photos are attached and sent
- (web/feedback) rewrite the issue-report feature doc for the feedback page
- (adr) replace the floating issue-report widget with a feedback page

## [2026-08-10] - root@0.50.2, @chatic/desktop-web@0.4.3

### Bug Fixes

- (desktop-web) open the thread when a reply's push is clicked
- (desktop-web,docs) stop the local-cursor cap from swallowing the fallback badge
- (desktop-web) keep the local read cursor authoritative under the netted count
- (desktop-web) stop emoji reactions from raising an unread badge

### Documentation

- (adr) record how unread is derived, and where the three clients disagree

### Refactor

- (desktop-web) give the notification deeplink one encoder and one thread-open rule
- (desktop-web,app-messages) tidy the unread derivation after the reaction fix

## [2026-08-10] - root@0.50.1, @chatic/web@0.43.1

### Features

- (web/runtime) clear the place cache once on app boot
- (web/place) add the read-only place information screen

### Bug Fixes

- (data/place) filter out the mistagged relay home place ('0000')
- (web/place) pin the relay place-info screen to the owner variant

### Refactor

- (web) extract useScrollRestoration as a shared hook

## [2026-08-10] - root@0.50.0, @chatic/web@0.43.0

### Features

- (web/home) uncap place and channel creation on dev-class builds
- (web/chat) skeleton the room while it loads, and fade the glass header in instead of popping it
- (web/chat) remember the room's scroll offset across every exit, not just a thread hop
- (web/invite) return to the room, not a stacked settings/invite trail, once the link is shared
- (web/auth) add a dev-only bypass to the phone-verification switches
- (web) let a development build type a non-numeric bypass code
- (web/invite) let a release app invite by link, not only by text
- (web/chat) finish the reaction and thread surfaces, and show deleted messages
- (web/channels) link URLs in chat messages and unfurl the first one
- (web-ui-kit) add the chat link preview card
- (mobile) add unfurlService and wire the og-metadata bridge handler
- (web/chat) route a reply push through the channel into its thread
- (web/chat) add emoji reactions and threads, and stop reaction events breaking the feed

### Bug Fixes

- (web/chat,data) reflect a kick in the local join and member caches
- (web) stop counting unread for places the user cannot reach
- (web/chat) stop badging members as pending invites
- (web) tell a departed member from a pending invite, and stop the phantom badge
- (web/chat) open a thread on its root message instead of a spinner
- (web) measure the floating chrome before the first paint
- (web/notifications) silence the in-app banner inside a thread, and give it a face

### Documentation

- (web/chat) record the reaction and thread refinements
- (chat-link-preview) add the ADR and the live architecture doc

### Refactor

- (web/home) fold the create-place flow back into the dialog, drop the mandatory profile step

### Chores

- (deps) bump chatic-socials-api for reaction types, drop the DomainChat casts

## [2026-08-06] - root@0.49.1, @chatic/web@0.42.1

### Features

- (web-ui-kit) give the place avatar its own placeholder
- (web/invite) keep the release app on SMS invites, and rebuild the friend picker
- (web-ui-kit) size the selected-friend strip to Figma's friend picker
- (web/invite) text a single invite to the number instead of opening the share sheet
- (web-ui-kit) make the profile avatar's empty state Figma's 1명 Profile
- (web/chat) flag pinned and muted rooms, and give the self room my photo
- (web/place) make the profile the last, mandatory step of creating a place
- (data/user) make the embedded $site write injectable, and pin apps/web to relay

### Bug Fixes

- (web/dialogs) correct safe-area insets in CreateChannelDialog
- (web/mypage) edit the account profile from a cloud, and settle the place before its profile
- (web/chat) give a group room its two-person placeholder on every surface
- (invite) send each batch recipient as its own E.164 entry
- (web/mypage) pin the account profile to relay, and block editing it from a cloud
- (data/place) carry id on place.update, and reconcile the list against the server

### Documentation

- (web/place) record the relay place scoping decisions and the avatar plan

### Refactor

- (web) move shared components out of home and stop barrels re-exporting heavy modules

### Other

- revert: (web/mypage) show the account profile of whichever session is active

## [2026-08-06] - root@0.49.0, @chatic/web@0.42.0

### Features

- (web/search) give place results their photo and the place placeholder
- (web/search) name the sender of a chat result, with their photo and date
- (web/search) say which cloud is being searched
- (web/search) show place, channel and chat results with their real context
- (data) read a search result's surrounding rows across clouds
- (web/search) switch the place, not just the cloud, when opening a result
- (web/channels) jump to a message by chatNo from search
- (web) add local global search page
- (app-runtime) wire global cache search into the cache storage strategies
- (data) add cross-cloud global cache search source

### Bug Fixes

- (web/search) load a chat author's profile instead of only reading cache
- (web/search) a chat sender is their place profile, not their account nick
- (web/search) name a chat result's sender the way the room does
- (web/channels) reach a jump target through the cache instead of paging for it
- (web/search) scope the scan to the active cloud, keep results on the way back
- (data) resolve MY read cursor, not a co-member's, for search unread counts
- (web/channels) stop the bottom pin from overwriting a message jump
- (web/search) stop the search effect re-running itself into a flicker loop
- (web/bridge) return to relay on relay-origin push taps instead of switching to '#'
- (web) handle a rejected global cache search instead of going silent

### Documentation

- (adr) add push relay/cloud crossover routing ADR and spec
- (adr) add local global search ADR and specs

### Refactor

- (search) drop the account-cache fallback for a chat sender

### Chores

- (web/search) log why a chat sender's profile went unresolved

## [2026-08-05] - root@0.48.3, @chatic/web@0.41.2

### Features

- (web/invite) adopt real cancel/reject and support international phone numbers

### Bug Fixes

- (web) reconcile with develop's cloud-promo work after the rebase
- (web/invite) hide the account-split banner once social is linked, and add the en key that leaked
- (web) stop the invite/verify screens overflowing narrow phones and hiding behind the keyboard
- (web/invite) a declined invite that was already accepted is not someone else's
- (web/invite) prove the invitee's number in the mode their session allows

## [2026-08-05] - root@0.48.2, @chatic/web@0.41.1

### Features

- (web/subscription) add login gate for subscription flows

### Bug Fixes

- (web) decode raw DOM Events in unhandledrejection reports instead of [object Event]
- (web/invite) gate useRelayInvites on relay verified, not the active slot
- (app-runtime/socket) name failing calls in socket errors, add reactive kind-verified state

## [2026-08-05] - No version updates

### Features

- (desktop-web/chat) bring back the sidebar message preview

### Bug Fixes

- (desktop-web/chat) keep a failed send out of the sidebar preview

## [2026-08-05] - root@0.48.1, @chatic/desktop-web@0.4.2

### Features

- (desktop-web/chat) fix the quick reactions to 👍 and 🆗
- (desktop-web/chat) react in one click, and let go of the toolbar afterwards
- (desktop-web/chat) mark an edited message, and clear a deleted one
- (desktop-web/chat) leave a tombstone wherever a message is deleted
- (desktop-web/chat) make editing and deleting a message legible
- (chat) react to messages with emoji
- (desktop-web/chat) edit and delete your own messages
- (desktop-web/settings) let this device turn off push notifications
- (desktop-web/chat) render join and leave events as notices
- (desktop-web/chat) round and shrink the person avatars
- (desktop-web/chat) quiet the channel sidebar
- (desktop-web/chat) compact the link preview into a chip

### Bug Fixes

- (desktop-web/chat) stop an unhandled rejection in invited-cloud recovery
- (desktop-web/chat) show reactions in the thread panel
- (desktop-web) rebuild the invited cloud's local record, name included
- (desktop-web) keep invited clouds on the rail across profiles
- (desktop-web) move the socket session when the place changes
- (desktop-web/chat) keep the message toolbar up while it has something open
- (desktop-web/chat) close the emoji picker once you have picked
- (data) mark a deleted chat hidden in the cache instead of dropping it
- (desktop-web/chat) say so when a reaction is rejected
- (desktop-web/chat) import the viewer-id helper MessageList calls
- (chat) make the reaction toggle optimistic, and roll it back on failure

### Documentation

- (web) correct the refresh-timing section against the code

### Refactor

- (desktop-web/chat) keep reactionKey internal
- (desktop-web) tidy the cloud rail merge and its recovery effect
- (desktop-web/chat) de-duplicate the reaction and identity rules
- (desktop-web/chat) drop the unfurl fields the chip never renders
- (desktop-web/chat) stop restating the avatar default

### Other

- test: (app-runtime) admit syncInvitedCloudName to the public surface
- test: (desktop-web/chat) render the two derivations that live in MessageList
- build: add a gate for identifiers that are used but never bound
- test: (desktop-web/chat) pin the reaction join, and toggle from the picker
- test: (desktop-web/chat) make the empty-unfurl case actually assert

## [2026-08-04] - root@0.48.0, @chatic/web@0.41.0

### Features

- (web-ui-kit) promote the plan comparison card and match the guide to Figma
- (web) rework relay home and cloud switcher, add the cloud guide screen
- (web-ui-kit) add PromoBanner and collapsible section header/footer slots

### Bug Fixes

- (web/home) stop the switcher shimmering forever and count only owned clouds
- (web/home) send the promo link to the cloud guide and stop the page scrolling sideways

### Documentation

- (web) record ADR-0034 and refresh the home/subscription feature docs

### Other

- test: (web/home) mock the relay-invite rows HomePage now reads
- test: (web/home) cover the relay-home branch and the switcher's section layout

## [2026-08-04] - root@0.47.0, @chatic/web@0.40.0, @chatic/landing@0.4.1

### Features

- (web/subscription) require a linked social account before charging
- (web/auth) prove an account through one packet, and read what is linked
- (web) ask for a place profile where a name should be
- (web/channels) one title chain per channel, one intro per stereo
- (web/mypage) hold the social-link section back until linking can be read
- (web/invite) show the invited place on a 1:1 accept screen
- (web/channels) name a 1:1 room the same way on every surface
- (web-ui-kit) match SystemMessage to the Figma chat-entry spec
- (web/mypage) keep the store row on iOS and branch its label
- (web/invite) open an invite on its own page instead of over home
- (web/invite) add the /invite/accept route
- (web/invite) add the redirect layer for the invite accept route
- (app-runtime) wait on a specific socket slot's handshake
- (web/invite) split the accept popup into group and 1:1 variants
- (web-ui-kit) add the invite accept screen's duotone glyphs
- (web/invite) resolve an accepted invite's room in three tiers
- (data) add remote-only invite and auth repositories
- (data) add the invite source and the auth identity packets
- (web/invite) gate relay invite issuance behind phone verification
- (web/invite) add relay 1:1 invite sender flow
- (web-ui-kit) add expired variant to StatusBadge
- (web/hooks) add local sent-invite log for relay invite tracking
- (web/bridge) add SMS composer bridge for relay invite delivery
- (web/invite) add the relay invite accept popup
- (web/invite) orchestrate the relay invite accept steps
- (web) wait for the DM room an accepted invite creates
- (web/invite) add the relay invite stubs and Track A contract mocks
- (web/auth) add the phone-verification screen for the relay invite flows
- (app-runtime) apply the verify-hash-alias session token to the relay socket
- (web-core) commit an already-issued relay token as the active session
- (web/mypage) add social-link section to account info (Track D)
- (web/home) detect the relay marker on invite deeplinks
- (web) add the relay invite and phone-verification contract hooks
- (data) wire the relay invite socket gateway

### Bug Fixes

- (data) drop unusable channel rows and honour an empty snapshot
- (web/channels) wait for a channel instead of calling a cache miss an absence
- (web/push) leave a way back when a push opens a room
- (web-ui-kit) hold the caret through a tapped send button
- (web/channels) let a member exist without a cached user row
- (web/auth) dock the phone-verify CTA on a floating panel
- (web-ui-kit) ride a bottom sheet above the soft keyboard
- (web/invite) retire the previous invite when reissuing
- (web/ui) scroll a focused field clear of the docked CTA
- (web/invite) restore the imports the contact-invite CTA switch needs
- (web) align channel list row avatars with Figma
- (web/invite) recognise a code-only share link as a relay invite
- (web/invite) stop a booting relay socket failing the accept as unclassified
- (web/appupdate) source the update row from the live check
- (web/invite) stop the countdown leaking ticks and wire the dropped invite fields
- (mobile/ios) build ReactNativeStaticServer in a space-free temp dir
- (web/invite) wire the rejected-state flag and drop the dead one
- (web/invite) refetch the invite list on window focus
- (web) restore develop's updateAvailable copy after the rebase merge
- (web-core) send logout straight home instead of rewinding history
- (app-runtime) reject when the relay socket keeps the old identity
- (web) align Track A·B relay invite screens with Figma
- (web/invite) make the cancel/reissue flags actually gate copy

### Documentation

- retire the manual test-flow notes
- (web) follow the place card reversal and the avatar glyph rename
- (adr) reverse the 1:1 place card exclusion and reset invite validity to 1 day
- (test-flows) add the 1:1 invite and DM chat manual flow
- (adr) record the DM name chain and the invite profile release
- (web/channels) rewrite the DM feature doc around the shared name chain
- (spec) mark the invite accept entry live
- (spec) plan the invite accept page split from home
- (adr) record the group and 1:1 invite accept variants
- (adr) record the three-tier resolution for an accepted invite's room
- (plans) record the roadmap audit and the three gaps it closed
- (adr) unify the data access surface on repositories
- (plans) hand the invite follow-up work to a fresh session
- (plans) record the invite track integration and what remains
- (web/invite) mark the relay invite accept spec live
- (web/invite) spec the relay 1:1 invite accept flow
- (web/auth) document the phone-verification architecture as Live
- (web/mypage) cite ADR-0033 request #6 in the social-link cache TODO
- (web/account) add social-links architecture doc for Track D
- (plans) base the invite tracks on the integration branch
- (adr) add relay DM invite ADR and parallel-track roadmap

### Refactor

- (app-runtime) stop handing the gateway bundle back out
- route every read and write through a repository
- (web) keep invite cancel and decline ids in the preference store
- (web-ui-kit) make the solid silhouette the only user avatar glyph
- (web/invite) stop asking for a place profile before accepting
- (web/invite) take the Dialog costume off the accept screen
- (web/invite) move the accept flow out of the home feature
- (web/channels) extract shared korean phone helpers
- (web/invite) swap the Track A mock for the real phone-verification screen
- (web/invite) split the invite dialog into a deeplink router
- (web/mypage) share Google/Apple provider icons between screens

### Chores

- (web/invite) drop an unused Button import
- (deps) bump chatic-sockets-lib to 0.4.9 and backend-api to 0.26.704

### Other

- test: (web/hooks) cover the phone-verification and social-attach hooks
- test: (app-runtime) pin device-id storage survival across the session switch

## [2026-07-30] - root@0.46.1, @chatic/desktop-web@0.4.1

### Features

- (desktop) tell the truth about the connection, and resend what failed
- (data) bound the desktop chat cache per channel
- (desktop) run the renderer sandboxed and add launch-at-login

### Bug Fixes

- (desktop) stop reporting the app language as English on every machine
- stop the desktop cache cap from applying to every browser client
- (desktop-web) show messages that are still sending or failed

### Documentation

- (readme) list the sandbox gate under Code Quality
- (adr-0006) correct the native-path claims after merging develop
- (adr-0006) record that full bounding did not take the planned migration

### Refactor

- (app-runtime) delete the outbox retry path no caller can enable
- dedup what the desktop work duplicated

### Chores

- keep wayfinder scratch maps out of the repo

### Other

- test: (desktop) fail the sandbox gate when it would test nothing
- test: (desktop) add a sandbox smoke gate that proves its own sensitivity
- style: (adr-0006) apply prettier to the amended section
- test: (desktop) name the file the mobile-parity assertion is copied from

## [2026-07-30] - root@0.46.0, @chatic/web@0.39.0

### Features

- (web-ui-kit) swap in the new DoU character/wordmark artwork
- (web/mypage) split the version row per Figma, gate update row to iOS
- (deeplink) add relay invite link support
- (web) add the app update prompt and wire it through appBridge
- (mobile) add versionService and wire the app-update bridge handler
- (app-messages) add CheckAppUpdate/OpenStore message contract

### Bug Fixes

- (mobile/ios) quote TARGET_TEMP_DIR in ReactNativeStaticServer's cmake build
- (mobile/sqlite) gate every query on migrations completing
- (core) improve database migrations and storage adapter robustness
- (web) silence no-empty-function for the test's foreground-handler stub
- (web/home) stop the DoU Home mascot clipping inside its avatar disc

### Documentation

- (adr) add app update check ADR

### Chores

- (web/home) drop the lastChat$ fallback from unread head calc
- (mobile) fix import order in affected version-check tests
- (mobile) bump app versions 0.21.1
- (web/appupdate) drop remaining kill-switch gating
- (web/appupdate) re-enable app update check feature
- (web) temporarily disable the app-update-check feature
- (mobile) bump app versions 0.21.0

## [2026-07-29] - root@0.45.0, @chatic/web@0.38.0

### Features

- (web/place) add the chat-room management screen
- (web/channels) show the invite-link copy action as text
- (web) add the Figma point blue and pink color tokens
- (web) float header and bottom chrome as translucent overlays
- (web) edit cloud name as the cloud entity and keep it fresh via cache
- (debug) show meta sync cursors in cache storage viewer

### Bug Fixes

- (web) stop the bottom-nav clearance collapsing on a bad safe-area inset
- (web) match the unread pill to the design system
- (web) keep the bottom sheet's rounded corners under the glass header
- (data) stop collapsing every place profile onto one cache key
- (web/home) float the create-dialog headers and re-enable place creation
- (web) keep bottom CTAs clear of the soft keyboard
- (web/home) stop forcing place-profile setup on place entry
- (web) make chrome insets, chat bubbles and profile sync behave under a keyboard
- (web) stop reserving keyboard height in the bottom safe-area spacer
- (app-runtime) migrate invited clouds from hot to cold on boot
- (web/channels) match MemberProfileDialog header top spacing to other modals
- (data) shorten meta sync-cursor TTL so stale channel lists re-sync
- (debug-mode) gate debug features solely by 10-tap unlock
- (app-runtime) use single-tier cache per platform (native cold-only, web hot-only)
- (web) gate device.sync sends on a connected socket
- (web/bridge) recover invited cloud on deep-link/push-tap before cloud switch
- (web) clear device viewing target when the app goes to background
- (web/home) make invite popup full-bleed so safe areas aren't white
- (web/channels) fall back self-chat title to profile nick when join nick is a raw id

### Refactor

- (web) keep the required-field asterisk out of ui-kit and desktop-web
- (web/place) split place settings into titled sections
- (web/place) open channel sort as a bottom sheet and restyle the place profile
- (web/home) route place-profile edit through the settings hub and trim the header menu

### Chores

- (web/mypage) open the account editor from the profile header
- (web/home) temporarily disable the CreatePlace dialog

### Other

- test: (web) repair the four suites that had rotted against their sources

## [2026-07-28] - No version updates

### Features

- (web/channels) add 1:1 DM chat screen

## [2026-07-28] - root@0.44.0, @chatic/desktop-web@0.4.0

### Features

- (mobile) custom web ZIP PoC — download, unzip, serve via local static server
- (desktop) default to the recolored desktop-web bundle
- (desktop) default to the desktop probe bundle, not the mobile one
- (desktop-web) drive the custom UI PoC from the debug panel
- (desktop) keep the custom UI across restarts, and fall back when it breaks
- (desktop) apply and reset a custom UI bundle from the tray
- (desktop) serve a custom UI bundle over a privileged local scheme

### Bug Fixes

- (mobile) silence partialize unused-binding warning
- (mobile) restrict SavePreference bridge writes to an allowlist
- (desktop) hand a bundle's client routes back to its router
- (desktop) make the custom-UI escape hatch reachable
- (desktop) bound the download, and stop claiming what the code does not do
- (desktop) refuse redirects, roll back a failed swap, serialize applies
- (desktop) close the symlink escape and stop apply from destroying a live bundle
- (desktop) fall back to the remote web when a custom bundle hangs
- (desktop) keep initWebUrl from seeding the custom-UI origin

### Refactor

- (mobile) simplify customZip per /simplify review
- (desktop) remove the duplicated state the custom UI PoC introduced
- (desktop) funnel web URL and origin trust through one module

### Chores

- (mobile) default custom-web-zip input to the S3 sample bundle

### Other

- build: reconcile the lockfile after landing the mobile PoC on current develop
- build: (mobile) wire native deps for custom web ZIP PoC

## [2026-07-28] - No version updates

### Features

- (web/place) add place settings hub with profile edit and channel sort

### Documentation

- (adr) add place settings hub ADR

## [2026-07-27] - No version updates

### Features

- (error-report) categorize and tag reports, attach breadcrumb context

### Bug Fixes

- (web/debug) keep scroll position stable when paging the log buffer

### Documentation

- (adr) add error-report categorization and enrichment ADR

## [2026-07-27] - No version updates

### Features

- (debug) add full CRUD + clipboard copy to cache DB browsers
- (app-runtime) activate native cold DB and make invited clouds recoverable

### Bug Fixes

- (mobile/deploy) anchor fastlane AAB and changelog paths to the fastlane dir
- (app-runtime) create invited cloud from push and sync its name via cloud.get

### Refactor

- (app-runtime) drop web-core invited-cloud registry; cache DB is single source

### Chores

- (mobile) bump app versions 0.20.1

### Other

- style: (debug) wrap StorageTestScreen editor panel line for prettier

## [2026-07-24] - No version updates

### Features

- (device-push) disable push mute in web; pin relay route to data layer

### Documentation

- (adr) update device push mute routing and web support decision

### Refactor

- (socket) implement per-slot runtimes to fix device linking
- (socket) pin device push mute to relay and enable per-slot sync runtimes

## [2026-07-23] - root@0.43.3, @chatic/web@0.37.3

### Features

- (web/mypage) add device global push-mute toggle
- (app-runtime/socket) add kind-scoped socket routing for relay-pinned device push

### Bug Fixes

- (admin-v2) drop removed useTokenRefresh from app bootstrap
- (web) align invite dialog and chat tests with updated backend model types

### Refactor

- (data) type device.update-remote response and reconcile push-mute from server echo

## [2026-07-23] - root@0.43.2, @chatic/web@0.37.2

### Features

- (web/home) make place-profile setup mandatory and harden absence detection
- (web/home) enhance cloud display and PRO tier logic
- (web/home) improve cloud switch sheet and restore guest entry
- (web/channels) unify channel-settings header title with the role-based rule
- (web/home) make header place-profile only, right avatar always clickable, cloud-name id fallback
- (web/channels) redesign the self chat room + role-based header title
- (web/channels) register chat-room join sync for the full member roster
- (web/home) branch channel-list title by role (owner=channel.name, member=join.nick)
- (web/channels) unify room-name placeholder to current room name / place profile
- (web/home) title self channel by join-list nick first, sort channel list by join updatedAt
- (web/home) show guidance on clouds with no active place
- (web/home) strengthen place-profile setup UX
- (app-runtime/sync) clean up removed join cache (implement JoinSyncPlan onRemove)
- (web-ui-kit) animate collapsible section expand/collapse height

### Bug Fixes

- (web/home) show place/channel lists on first cloud connect without a refresh
- (web/bridge) stop push navigation from piling up the history stack
- (web/channels) sort pending messages to the bottom of chat list
- (web) clean up safe-area handling for bottom CTAs and the top bar
- (testbed) apply role-based chat-room header title rule and fix broken div tags
- (web/home) fix stale last message in channel list (head-based refetch)
- (testbed) add a max width cap to chat message bubbles
- (web/channels) wrap long messages via min-w-0 on the message row
- (web-ui-kit) cap message bubble column at max-w-75% to prevent horizontal overflow
- (testbed) remove chat bubble horizontal overflow and wrap long messages
- (web/home) base unread count on the subscribed join list and fix bottom spacing
- (web/mypage) add bottom-nav spacing and fix the scroll container

### Refactor

- (web/sync) limit self-channel fetch to place-selected + relay-server
- (web/home) scope my-join sync to home (app badge observes only)
- (web/channels) remove chat-room join sync registration (global sync owned by home)
- (web/sync) drop the full channel snapshot, load notes-to-self via getSelfChannel

### Other

- test: (web/channels) align room-name dialog tests with the empty-field/placeholder contract

## [2026-07-21] - No version updates

### Features

- (web/channels) 나와의 채팅(self) 채널 유형 반영

## [2026-07-20] - No version updates

### Features

- (web/channels) 채팅방별 알림 끄기 (join.update notify 연동)

### Documentation

- (adr) 채팅방 알림 ADR 번호 0024→0025 리넘버
- (channels) 알림 토글 데이터 연동 기록 (ADR-0024) 및 설정 문서 갱신

### Refactor

- (web/channels) 알림 초기값을 channel.$join 대신 join 스트림에서 읽기

## [2026-07-20] - No version updates

### Features

- (web/channels) 그룹 채팅방 헤더 아바타 스택·총원·읽음표시 반영
- (web-ui-kit) 채팅방 헤더 meta 슬롯·읽음/안읽음 표시 확장

## [2026-07-20] - No version updates

### Features

- (web/channels) 채널 상세 팝업 Figma 재디자인 (방 정보 2모드·멤버 프로필·개인 방 이름)

### Documentation

- (adr) 채널 상세 다이얼로그 ADR 번호 0022→0023 리넘버
- (adr) 친구 설정 보류 사유·확정 디자인 기록(ADR-0022)
- (adr) 채널 상세 다이얼로그 재디자인 기록(ADR-0022) 및 channel-settings-ui 갱신

## [2026-07-20] - root@0.43.1, @chatic/web@0.37.1

### Features

- (web/channels) 초대 화면을 다이얼로그에서 페이지로 전환하고 Figma 디자인 반영
- (web-ui-kit) 초대 화면용 SelectedAvatarRow·InviteLinkCard·IconLink 추가

### Documentation

- 채널 초대 페이지 전환 기록(ADR-0022) 및 invite 피처 문서 추가

## [2026-07-20] - No version updates

### Features

- (web/channels) 채널 메인 화면 Figma 디자인 반영
- (web-ui-kit/chat) 채널 룸 화면 Figma 컴포넌트 추가/개선

### Documentation

- (adr) 채널 룸 Figma 개선 기록(ADR-0021) 및 chat-room-ui 갱신

## [2026-07-20] - No version updates

### Features

- (web/place-profile) 플레이스 프로필 수정 화면을 다이얼로그로 전환하고 생성/수정 공통화

## [2026-07-20] - No version updates

### Features

- (web/home) rebuild place & group-room creation screens on web-ui-kit

## [2026-07-20] - No version updates

### Features

- (web/channel-settings) 그룹방 설정 화면 섹션 리스트형 개편

### Documentation

- (channel-settings) 채널 설정 아키텍처 문서 및 ADR-0019 추가

## [2026-07-20] - No version updates

### Features

- (web/i18n) add localization for group chat invite target
- (web/invite-accept-screen) implement glassmorphism design
- (web-ui-kit/icons) add image icon
- (web/i18n) add UI localization for menus and place list Adds new localization keys to support various UI elements across the application. This includes:
- (web/channels) extend keyboard open tolerance in channel room Extends the `onPointerDown` handling to the entire bottom bar of the channel room. Previously, tapping on the padding or other elements within the message input's surrounding area could cause the mobile keyboard to dismiss.
- (web/channels) ensure message row avatar placeholder alignment
- (web/home) implement scroll restoration for home list
- (web/home) refine DoU Home avatar and standardize PlaceAvatar Further refines the 'DoU Home' place avatar to precisely match Figma specifications (2869:48261). The mascot is now displayed on a 42px brand-green disc with a hairline border.
- (web-ui-kit/message-input) keep mobile keyboard open
- (web-ui-kit/place-avatar) render name initial or home glyph
- (web/home) brand default place as DoU Home and refine avatars

### Bug Fixes

- (web/home) gate profile prompt on settled app context
- (web/runtime) gate foreground sync on user verification

## [2026-07-16] - No version updates

### Features

- (web/issue-report) add floating issue report widget
- (web-core) attach logs & device context to reportIssue

### Documentation

- (issue-report) add feature doc + ADR-0017

## [2026-07-16] - No version updates

### Features

- (web/home) redesign invite accept popup on web-ui-kit
- (web-ui-kit) add AlertDialog single-action variant and Clock/Users icons

### Documentation

- (home) add invite-accept architecture doc + ADR-0016

## [2026-07-16] - No version updates

### Features

- (web/channels) redesign channel settings with profile & notification dialogs
- (data/channels) support owner kick via leaveChannel userId

### Documentation

- (channels) add channel-settings-ui doc + ADR-0015

## [2026-07-16] - No version updates

### Features

- (web/home) apply ADR-0014 Figma visual refinement
- (web-ui-kit) add ImageAvatar and drop FloatingTabBar gradient backdrop

### Documentation

- (home) add ADR-0014 and sync home feature doc

## [2026-07-15] - No version updates

### Features

- (web/layout) floating bottom nav in shell + redesign MyPage on web-ui-kit

### Documentation

- (adr) renumber layout-shell ADR 0010 → 0011

## [2026-07-15] - root@0.43.0, @chatic/web@0.37.0

### Features

- (web) add place profile create overlay
- (web-ui-kit) add TextField enforceMaxLength for soft over-limit

### Bug Fixes

- (web-ui-kit) stop AlertDialog action row inheriting buttonVariants

### Documentation

- (adr) renumber place-profile ADR to 0012 under docs/adr

## [2026-07-15] - No version updates

### Features

- (web/channels) rebuild chat room screen on web-ui-kit
- (web-ui-kit) add chat AvatarGroup/ReadReceipt/SystemNotice + header/row/input slots

### Documentation

- (channels) add chat-room-ui architecture doc + ADR-0010

## [2026-07-15] - No version updates

### Features

- (web-ui-kit) add CollapsibleSection and UnreadBadge pill variant

### Documentation

- (adr) renumber home web-ui-kit migration ADR to 0013

### Refactor

- (web/home) migrate home screen to web-ui-kit (ADR-0010)

## [2026-07-15] - root@0.42.4, @chatic/web@0.36.1, @chatic/desktop-web@0.3.5

### Features

- (app-runtime) cid-scoped sync + restore SDK auth-gated sync (Phase 2f)
- (app-runtime) dual-socket logout + same-wss cloud switch re-auth (Phase 2e)
- (app-runtime) activate dual sockets (relay + cloud) end-to-end (Phase 2d)
- (app-runtime) dualize SocketManager to Map<kind> with an active facade (Phase 2c)
- (web-core) add per-server (kind-explicit) auth bridge helpers (Phase 2a)
- (app-runtime) delegate logout to ClientSocketAuth + HTTP fallback (Phase 1c)
- (app-runtime) delegate login re-auth and site switch to ClientSocketAuth (Phase 1a/1b)
- (app-runtime) adopt SDK AuthController for single-socket auth (Phase 0)

### Bug Fixes

- (web/app-runtime) prevent duplicate channel sync on cloud switch (raine-client-socket-auth)
- (app-runtime/socket) gate auth.update on device.save:ok
- (web) fetch the new site's channels on a site switch (Trigger 4)
- (app-runtime) lower SDK auth refresh fallback to 5min (no-expiresIn stopgap)
- (app-runtime) reauth registers unconditionally + targets the kind's client (review #4/#6)
- (web-core) make logout a local-only teardown (drop POST /users/logout)
- (web-core) skip boot HTTP relay refresh in apps/web (SDK owns refresh)
- (app-runtime) gate socket re-auth on a verified connection (Phase 2 runtime fix)
- (app-runtime) clean up react-hooks/exhaustive-deps directives (Phase 2g)
- (app-runtime) address adversarial review of the SDK-auth migration (6 findings)

### Documentation

- (app-runtime) rewrite signing.md for per-socket kind routing (Phase 2g)
- (auth) mark web-core parallel refresh as deprecated in the SDK path (Phase 2)
- (auth) correct multi-socket + ClientSocketAuth design against SDK 0.4.5

### Refactor

- (app-runtime/socket-auth) align socket authId and identity token usage
- (app-runtime) consolidate runtime-layer hooks + rewrite/realign docs
- (app-runtime/socket-auth) adjust test mock access
- (desktop-web/runtime) remove external socket delegate injection
- (desktop-web/socket-recovery) align wake recovery with SDK reconnect
- (app-runtime/connection) adjust test import for RuntimeConnectionHost
- (web) consume relocated session hooks from app-runtime
- (app-runtime) split socket/auth, relocate session hooks, tighten surface
- (web-core) extract config module and group the public barrel
- (app-runtime/connection) single init driver + relay logout is manual-only
- remove dead code + collapse redundant refresh flag (code-review cleanup)
- (web-core) remove redundant CLOUD_IS_ACTIVE_KEY

### Other

- perf: (web-core) per-cloud token cache + align home place cid to optimistic
- perf: (web) parallelize independent socket fetches in background sync

## [2026-07-14] - No version updates

### Bug Fixes

- (cloud) derive cid from payload instead of active-server context
- (auth) skip local cache clearing on logout

## [2026-07-12] - No version updates

### Features

- (logging) capture full network detail in transport logs

### Bug Fixes

- (invite) resolve invite-accept errors to specific messages
- (debug) use correct device and install IDs

### Refactor

- (invite) inline resolveInviteErrorKey into useInviteAccept

## [2026-07-10] - root@0.42.3, @chatic/desktop-web@0.3.4

### Bug Fixes

- (desktop-web) sort pending sends to the bottom, not the top
- (desktop-web) show last main-channel message in channel list preview

### Refactor

- (desktop-web) dedupe chat sort, memoize channel preview

## [2026-07-09] - root@0.42.2, @chatic/desktop-web@0.3.3

### Bug Fixes

- (desktop-web) drop cache reads that resolve after unsubscribe
- (desktop-web) re-subscribe cache observers on uid change

## [2026-07-09] - root@0.42.1, @chatic/desktop-web@0.3.2

### Bug Fixes

- (desktop-web) scope the Home channel list by the real site id

## [2026-07-09] - root@0.42.0, @chatic/web@0.36.0, @chatic/admin@0.4.2

### Features

- (web/debug) rework web log viewer with filter, search, and detail
- (mobile/perf) implement boot metrics and debug mode sync Introduce `BootMetricsService` to track native boot milestones and integrate web-side boot metrics via the `SendBootMetrics` contract. This also implements web-native debug mode synchronization through the `SetDebugMode` contract, enabling a single 10-tap unlock for both layers.
- (web/native) sync debug mode and report boot metrics
- (app-messages) add web-native boot perf and debug mode contracts
- (logger) add pub/sub logging core with in-memory web buffer
- (web/debug) add boot/perf instrumentation to the debug overlay
- (web) manage theme via usePreferenceStore with system default

### Bug Fixes

- (web/home) re-subscribe cache observers on uid change
- (web/debug) load native log buffer via bridge response, not events

### Documentation

- (mobile/docs) add v0.19.2 baseline boot metrics and analysis
- (web) document theme architecture and refresh stores doc

### Refactor

- (admin) disable admin module and simplify app structure
- (web/debug) consolidate debug tools into a single overlay

### Chores

- (mobile) bump app versions 0.19.2

## [2026-07-09] - root@0.41.1, @chatic/desktop-web@0.3.1

### Bug Fixes

- (desktop-web) show the default cloud's self channel

## [2026-07-08] - No version updates

### Features

- (mobile-deploy) document mobile app deployment pipeline
- (mobile-release) implement Fastlane configuration for deployment
- (mobile-release) add mobile app deployment and versioning scripts

### Bug Fixes

- (web/bridge/navigation) compare full location for push navigation

### Chores

- (mobile) bump version to 0.19.1

## [2026-07-08] - root@0.41.0, @chatic/desktop-web@0.3.0

### Features

- (desktop-web) restore the last-open channel when returning to a cloud
- (desktop-web) lock the cloud rail until a switch settles, not just the exchange
- (desktop-web) hold each cloud's channel list through switch blips with a snapshot
- (desktop-web) keep each cloud's channel list on switch — no flicker

### Bug Fixes

- (data) don't prune the channel list on an empty refresh response
- (app-runtime) scope channel cache writes to the socket's actual cloud
- (app-runtime) reject socket frames from a cloud the cache no longer points at
- (desktop-web) hold the channel skeleton across a cloud switch until it re-verifies
- (app-runtime) drop socket cache writes during a cloud switch to stop partition poisoning
- (desktop-web) only fold REAL, non-active clouds into the dock badge
- (desktop-web) re-key the channel list on cloud switch, not just place
- (desktop-web) stop the dock badge sticking at 1 with everything read

### Chores

- (desktop-web) remove channel-switch and badge diagnostic logs
- (desktop-web) use console.log for channel diagnostics so they show on desktop
- (desktop-web) add diagnostic logs to pinpoint the channel-switch flicker

### Other

- revert: (desktop-web) roll back the channel-switch changes to baseline

## [2026-07-08] - No version updates

### Features

- (device) sync foreground/background presence status via device.sync
- (notifications) show in-app message for foreground pushes
- (navigation) normalize history stack for push links
- (chat) hide own system messages from chat list and preview

### Bug Fixes

- (web/push-nav) send WebAppReady handshake after arming cold-start capture
- (bridges) ignore log relay traffic for web-ready detection
- (sync) allow foreground sync when unverified

### Documentation

- (push) document in-app banner implementation in push scenarios

### Refactor

- (device-sync) rename notifyViewing to syncDevice

### Chores

- (mobile) bump app versions 0.19.0
- (ios) apply Xcode project normalization
- (mobile/deeplink) warn when a push tap resolves to no path

### Other

- test: (bridges) drop duplicated relay-readiness spec
- test: (bridges) validate ignoring log/console relays for web-ready
- build: (deps) update @lemoncloud/chatic-sockets-lib to 0.4.6

## [2026-07-07] - No version updates

### Features

- (push) resolve device identity from single source with composite split
- (push) register web devices with bare unique device id

### Other

- build: (mobile) bump mobile app version to 0.18.0

## [2026-07-07] - No version updates

### Features

- (web/sync) refresh chat feed and lists on app foreground return
- (app/sync) full channel snapshot on rising edge + 1-day sync cursor TTL

### Documentation

- (web/data-flow) document foreground-return refresh trigger
- (web/data-flow) document channel snapshot on rising edge and sync cursor TTL

## [2026-07-07] - root@0.40.0, @chatic/desktop-web@0.2.0

### Features

- (desktop-web) reconnect the live socket on wake/refocus/online
- (desktop-web) scroll to latest on notification open; drop cross-cloud sender name
- (desktop-web) foreground toast click opens the channel too
- (desktop-web) cross-cloud push click navigation, mention-mode + dock badge
- (desktop-web) migrate app layer to v2 engine (socket + cache/sync)
- (desktop-web) reset account-scoped stores and caches on logout
- (desktop-web) dev-only account switcher in debug panel
- (desktop-web) global DND/snooze/quiet-hours + device-local mentions inbox

### Bug Fixes

- (web-core) recover the cloud session on a wake-expired refresh instead of wedging
- (desktop-web) stop the channel skeleton spinning forever on a wake-wedged socket
- (desktop-web) await socket handshake before push-open cloud/place switch
- (desktop-web) restore self profile display — read facts from useSessionProfile
- (desktop-web) show channel, sender and message in every notification
- (desktop-web) show channel-list skeleton instead of a false "No channels yet"
- (desktop) parse the nested push payload — server moved chat fields into data.payload
- (desktop-web) cross-cloud push + badge — resolve source cloud by channel, not uid
- (desktop-web) restore cross-cloud badge — learn cloud uid without a selected site
- (desktop-web) unstick the open channel's feed; drop the duplicate same-cloud banner
- (desktop) review fixes — dead bridge posts, window-lifetime guards, recovery backoff
- (data) map the join read cursor from the server's chatNo field
- (desktop) permission gating, renderer crash recovery, timer hygiene, error-page locale
- (desktop) inject real stage/version into the renderer, register push with stage
- (app-runtime) stop treating failed socket auth as verified
- (desktop) notification fixes — FCM click routing, silent-push banner, DND gate, focused doubles
- (app-runtime) self-heal a socket left disconnected so sends aren't lost
- (desktop-web) cross-cloud badge id-space + phantom place badge
- (desktop-web) update unread badges on push, attribute cross-cloud by uid map
- (desktop-web) resolve cross-cloud push to its cloud by source-cloud uid
- (desktop-web) harden v2 desktop — switching, unread badge, notifications, boot crashes
- (desktop) auto-recover from network-down load failures on boot/wake
- (desktop-web) restore last-selected place and channel on refresh
- (desktop-web) make @-mention autocomplete work with Korean IME
- (desktop-web) auto-load older history when the feed underfills the viewport
- (desktop-web) select @-mention on Enter, not send
- (desktop-web) open thread panel when jumping to a thread-reply mention/saved item
- (desktop-web) auto-reload renderer when socket wedged after sleep/wake
- (desktop-web) send bridge requests in object form, not positional
- (desktop-web) clear the unread divider on refocus, in step with the badge
- (desktop-web) deliver same-cloud OS notifications for live messages
- (desktop) refresh FCM token on launch + periodically to keep push alive
- (profiles) stop global nick clobbering place profile on member fetch

### Documentation

- (desktop-web) tidy the cross-cloud push presenter comment
- (audit) postmortem on channel-specific push broadcast gap

### Refactor

- (desktop) renderer owns cross-cloud banner decision; dedupe auth-state check
- (desktop-web) harden @-mention typeahead from code review

### Chores

- (docs) drop docs from this PR
- (desktop-web) temp diagnostic log for mention-capture gate
- (desktop) bump version to 0.0.13
- (desktop) drop per-channel banner coalescing

### Other

- perf: (desktop-web) restore MessageRow memoization, unserialize sends
- test: (desktop-web) cover socket wedge-reload self-heal logic

## [2026-07-07] - No version updates

### Features

- (app-runtime/push) shared device-token registration with force re-register

## [2026-07-06] - No version updates

### Features

- (mobile/push-ios) capture iOS notification taps
- (web/push-nav) await socket handshake before cloud/site switch
- (badge) background push increment + foreground reconcile
- (web/debug) add Push (token & receive) debug page and device info
- (mobile/debug) tap notification test log rows to copy
- (mobile/webview) compose uniqueId from device + Firebase install id
- (mobile/push) route notification taps to WebView via OnNavigate with cid/sid
- (scripts) enhance test push script with payload options

### Bug Fixes

- (ios/push) accept loc-args as native array or JSON string in NSE
- (mobile/deeplink) build invite query as string to keep params on device

### Documentation

- (mobile/docs) translate mobile app documentation to Korean

### Refactor

- (mobile/push-deeplink) converge inbound navigation on DeeplinkService + OnNavigate

### Chores

- (mobile/webview) reorder import in FirebaseInstallId test

### Other

- build: (mobile) bump mobile app version to 0.17.0

## [2026-07-03] - root@0.39.0, @chatic/web@0.35.0

### Features

- (web-core/api) introduce user and cloud profile API calls
- (last-chat) introduce useLastChat hook for message preview
- (app-runtime/socket) introduce gateSyncOnAuth option
- (home/unread) introduce unread dots and global app badge
- (testbed/unread) introduce cloud unread snapshots and dots
- (bridge/navigation) handle native push navigation (raine-auth)
- (testbed/manage) introduce place and channel management
- (app/profile) introduce profile update hooks and migrate app
- (app/runtime) add MyUserSeedRunner to prevent profile flashes
- (app/hooks) introduce app-level user profile and permissions
- (app-runtime) introduce useSessionProfile hook
- (testbed) implement unread counts and profile management
- (home) improve profile display and unread count accuracy
- (i18n) add system message and profile setup translations
- (testbed) add system message sending and display
- add invite link converter debug tool
- add system message suffix key mapping
- refresh user profile in background sync
- add profile to remote user gateway factory
- implement getMyProfile and cache site data
- add profile to UserDomainGateway and MockRemoteGateways
- add getMyProfile to UserRemoteDataSource
- re-export chat enums from socials-api Re-exports `ChatStereo` and `ChatSubType` from the `@lemoncloud/chatic-socials-api` package. This allows applications to reference these enum values through the data layer, rather than directly importing from the upstream socials-api package. The fields are already inherited by `DomainChat` and `DomainChannel`.

### Documentation

- (app-runtime/sync) update screen registration map for last chat & unread
- (auth) document SDK AuthController impl. and multi-socket design
- (notifications) document push notification and deep link navigation
- (auth) document SDK AuthController adoption and architecture
- (channels) document system messages (join/leave)

### Refactor

- (session) clarify delegatorId lifecycle and management
- (api/telemetry) streamline identity reporting
- (auth) streamline token refresh and session init
- (session) streamline identity state and profile management
- (testbed) remove deprecated identity fields from RuntimeOverlay
- (users) remove deprecated cloud update functions
- (web-core) streamline auth and identity data access
- (web-core) remove deprecated user hooks

### Chores

- update dependencies

## [2026-06-30] - root@0.38.0, @chatic/web@0.34.0

### Features

- implement route-based device viewing sync
- add DeviceRepositoryV2 for device viewing sync Introduces `DeviceRepositoryV2` to manage device viewing synchronization. This repository forwards viewing type and ID to the remote data source, allowing the server to track which target a device is currently viewing.

### Bug Fixes

- set active to true for setMyProfile

### Documentation

- add screen-registration-map.md for sync registration

### Refactor

- simplify channel member hydration
- update import paths for RuntimeBinding and SocketSessionDelegate This commit updates the import paths for `RuntimeBinding` and `SocketSessionDelegate`. Previously, these types were imported from `../runtime/useRuntimeBinding` and `../socket/types` respectively. They have now been moved to `../runtime` and `../socket`.
- remove useMyJoinsSync hook and related logic
- refactor chat sync plan
- remove console log from sync plans

### Chores

- (deps) update chatic-sockets-lib to 0.4.2

## [2026-06-29] - root@0.37.0, @chatic/web@0.33.0

### Features

- update dependencies for sockets and model
- update mobile app to handle invite links at root
- (channels) refactor channel management and routing
- (testbed) refactor docs structure and add invite flow
- (data) remove legacy v1 data sources and repositories
- (app-runtime) refactor socket and sync layers for v2
- (app-runtime) refactor sync and socket layers for v2
- refactor socket and sync layers for v2 (main)
- (app-runtime) refactor socket and sync layers for v2
- (data) refactor remote data sources and repositories
- (testbed) implement testbed application structure and routing
- (app-runtime) implement core runtime and session management
- (web-core) add auth and user hooks, refactor session layer

### Bug Fixes

- normalize profile IDs and improve sync handling

### Documentation

- update README for @chatic/data module
- add API infrastructure specification
- (web-core) migrate socket dependencies to app-runtime and data
- (data) restructure libs/data docs to match current architecture
- remove outdated documentation files

### Refactor

- remove unused event bus and repository types
- simplify localFactory for V2 data migration
- streamline web-core and remove unused code
- refactor web-core-module
- add 'meta' cache type and update views
- remove unused chat API and hooks The `libs/chats` library, including its API endpoints and React hooks, is no longer in use and has been removed. This cleans up the codebase by eliminating dead code.
- consolidate API and hook exports

## [2026-06-17] - root@0.36.0, @chatic/desktop-web@0.1.0

### Features

- (desktop-web) dock debug tools as a resizable side panel

### Bug Fixes

- (desktop) build dev installer via extends config (electron-builder 25.1.8)
- (ci) bump versions from merged commits, not just squash messages
- (desktop-web) resolve own place profile from cache by account uid
- (ci) preserve generic provider when overriding desktop publish url

### Chores

- (desktop) add desktop:start:local to load the local web server

### Other

- build: add app-messages lib reference

## [2026-05-12] - root@0.35.2, @chatic/web@0.32.2

### Refactor

- relocate web-specific types

## [2026-03-20] - root@0.35.1, @chatic/web@0.32.1

### Features

- (users) add fetchClouds API and useClouds hook

### Bug Fixes

- guard against undefined cloud.id in onSelectCloud

### Refactor

- replace usePlaces with useClouds from @chatic/users

### Chores

- comment out AddAccountButton temporarily
- (deps) bump @lemoncloud/chatic-backend-api to 0.26.316
- update iOS project files and web tsconfig references

### Other

- style: add bottom padding to CloudSessionSheet

## [2026-03-19] - root@0.35.0, @chatic/web@0.32.0

### Features

- add place info edit page with useUpdateMyPlace hook
- add social login (Google/Apple OAuth) on mobile app webview
- clear usertoken cache and OAuth session on logout
- improve PlaceList/ChannelList visibility based on cloud/place selection
- add resizeImage util and useUpdateMyProfile hook
- update ProfileEditPage with image resize and useUpdateMyProfile
- update PlaceInfoPage - name edit only, remove thumbnail upload
- show global loader while socket is connecting

### Bug Fixes

- allow isInvited users to view places without selectedCloudId

### Chores

- add libs/users tsconfig ref, bump chatic-sockets-api to 0.26.126

## [2026-03-18] - root@0.34.0, @chatic/web@0.31.0, @chatic/landing@0.4.0

### Features

- add child policy page

### Chores

- update AndroidManifest.xml
- bump version 0.8.2

## [2026-03-18] - root@0.33.1, @chatic/web@0.30.1, @chatic/admin@0.4.1

### Chores

- rename Chatic to DoU in workflows and UI

## [2026-03-18] - root@0.33.0, @chatic/web@0.30.0

### Features

- register device token after authentication
- add debug logs for device token registration
- add registerDeviceToken api and useRegisterDeviceToken hook

### Bug Fixes

- hardcode application name to chatic for device token registration

### Chores

- update dependencies

## [2026-03-18] - No version updates

### Chores

- (deps) update page transition package and import

## [2026-03-17] - root@0.32.0, @chatic/web@0.29.0

### Features

- add zustand storage adapter
- update theme store

### Bug Fixes

- resolve keyboard area padding issue

### Refactor

- refactor App
- update code convention

### Chores

- add comment to useQueryString hook

### Other

- style: apply safe-area

## [2026-03-17] - root@0.31.0, @chatic/web@0.28.0

### Features

- migrate @lemoncloud/react-page-transition

## [2026-03-17] - root@0.30.0, @chatic/web@0.27.0

### Features

- move PlaceList header inside component with filter dropdown
- place management page improvements
- add total unread badge to BottomNavigation
- reset selectedPlaceId on invite login & switch deeplink to local

## [2026-03-16] - root@0.29.0, @chatic/web@0.26.0

### Features

- add SplashScreen

### Bug Fixes

- fix build error

### Refactor

- change keyboard padding strategy (delegate from Native to Web)

### Chores

- add dependencies lottie-react-native
- add splash lottie file
- add import
- bump mobile version 0.8.0
- update package.json

## [2026-03-16] - root@0.28.0, @chatic/web@0.25.0

### Features

- add profile dropdown and improve message handling
- (chats) add notification settings page
- add report and block member functionality

### Refactor

- update webview url configuration
- (chats) simplify invite friends dialog and notification settings
- (mypage) remove MyPage route
- (device) improve contact permission handling

### Chores

- update page layout classes
- update ContactListItem component styling
- replace user image with icon

### Other

- build: (theme) update tsconfig lib references

## [2026-03-16] - root@0.27.0, @chatic/web@0.24.0

### Features

- update version update banner component
- add update checker and remove unused code
- add OpenURL message
- add phone number validation for Korean format
- (places) add delete and leave place dialogs
- (theme) add theme management
- add onboarding steps with i18n support

### Refactor

- (ui) introduce PageHeader component
- (main) update webview url and page layout

## [2026-03-16] - root@0.26.1, @chatic/web@0.23.1

### Bug Fixes

- fix native chat message load not working
- improve read status handling and unread count refresh
- update ReadStatus and HomePage display
- improve display name and logout handling for invited users
- show ReadStatus on all messages, hide when memberNo <= 1

## [2026-03-16] - root@0.26.0, @chatic/web@0.23.0

### Features

- add page transition
- add Android-specific view transitions
- add alert to exit

### Bug Fixes

- improve back button handling
- add debug logging and update canGoBack logic

### Refactor

- (chats, places) remove pt-safe-top class
- use LoadingFallback for loading states
- implement page-transition lib
- improve dialog handling
- (navigation) simplify back button handling
- remove console logs

## [2026-03-16] - root@0.25.1, @chatic/web@0.22.1

### Bug Fixes

- fix error for ios share sheet case

### Documentation

- update app-messages README.md

### Refactor

- append invite link to message field

## [2026-03-16] - root@0.25.0, @chatic/web@0.22.0

### Features

- (mypage) add view onboarding again feature
- add limit exceeded dialog and place creation limit

### Chores

- (ui) replace emojis with icons in ChannelList

## [2026-03-16] - root@0.24.0, @chatic/web@0.21.0

### Features

- (web) move auth routes to commonRoutes for auth-independent access
- (auth) redirect to / after login, /auth/login after logout, fix isInvited storage
- (web) apply isCloudUser logic using isInvited flag across components

### Refactor

- (web-core) remove dynamic endpoint override from static constants
- (mobile) restore webviewUrl to Config, remove dev localhost override

## [2026-03-16] - root@0.23.1, @chatic/web@0.20.1

### Refactor

- update message detail header layout

## [2026-03-16] - root@0.23.0, @chatic/web@0.20.0

### Features

- (web) migrate dialogs to Radix UI with back button prevention support

### Bug Fixes

- improve android back button handling

### Refactor

- (ui) replace X icon with ChevronLeft in multiple pages
- (ui) unify page headers
- (ui) update search input and add can go back functionality

### Chores

- add pt-safe-top to multiple page components
- (ui) adjust page layouts and header styling

## [2026-03-15] - root@0.22.0, @chatic/web@0.19.0

### Features

- hide invite UI and fix memberNo zero display for guest users
- add 500ms delay before fetching channel list

## [2026-03-14] - root@0.21.0, @chatic/web@0.18.0

### Features

- add global loader with message for cloud/place switching
- add saveSelectedCloudId/saveSelectedSiteId, getSocketSend, refreshToken target param
- skip selectedPlaceId check for guest users in channel bootstrap
- place session and cloud session sheet updates

### Bug Fixes

- fix make-site response payload type to use site$ field
- fix type error for $user access in useDynamicProfile

### Refactor

- (places) add useClouds hook, replace usePlaces in useCloudSession

## [2026-03-13] - root@0.20.0, @chatic/web@0.17.0

### Features

- update search and implement places
- update UI
- implement back button handling for hybrid app
- (places) add place order feature
- (places) add SortablePlaceItem component

### Refactor

- (home) enhance CreatePlaceDialog validation

## [2026-03-13] - root@0.19.0, @chatic/web@0.16.0

### Features

- place 관리, 검색, UI 개선
- (place) add place list, create place, cloud session sheet
- (cloud) expose clouds/isCloudsError from useCloudSession, apply to CloudSessionSheet
- (home) show no-cloud error state when isCloudsError
- (i18n) add cloudSessionSheet and homePage cloud error keys
- (search) implement real-time search with useMyPlaces and useMyChannels

### Bug Fixes

- (chat) fix textarea overflow by using items-end and rounded-3xl
- (onboarding) persist onboarding completed state to localStorage
- (mobile) restore Config-based webview URL
- (auth) preserve profile $user on cloud select, wait for profile before render

### Other

- style: (ui) apply dark monochrome theme to BottomNavigation, remove workspace settings from MyPage

## [2026-03-13] - No version updates

### Features

- (profile) add local profile overrides and image upload

## [2026-03-13] - root@0.18.0, @chatic/web@0.15.0

### Features

- update mypage
- (mypage) move settings from AccountInfoPage to MyPage
- update version info and device info

### Refactor

- rename onboarding images
- (mypage) update layout and styling for mypage features
- (mypage) replace AlertDialog with custom dialog implementation

## [2026-03-13] - No version updates

### Features

- (auth) add invite acceptance feature
- (chats) implement invite friends functionality
- (chats) add deeplink to invite friends share message

### Refactor

- (auth) update login and env storage logic

## [2026-03-13] - root@0.17.0, @chatic/web@0.14.0, @chatic/admin@0.4.0

### Features

- update home UI
- (home) remove channel description and sort channels by latest activity
- (chats) add empty state and invite friends feature
- implement search page
- update search
- improve invitation logic
- update room settings
- (chats) add unknown user label and improve member list item

### Bug Fixes

- (home) enhance CreateChannelDialog validation

### Refactor

- (search) parallelize message loading
- improve invite login failure handling and dialog components

### Chores

- (chats) update color scheme and typography

## [2026-03-13] - root@0.16.0, @chatic/web@0.13.0

### Features

- (mypage) add workspace settings and language select
- add i18n to web pages
- add chats indexedDB and update i18n

### Refactor

- (ui) update webview url and dialog variant

### Chores

- update branding to DoU

## [2026-03-12] - No version updates

### Features

- (place) show global loader while selecting place
- (channels) set isLoading true when requesting chat/mine

### Bug Fixes

- (auth) fix cloud token refresh not triggering on reconnect
- (socket) reset isVerified on disconnect
- (place) skip auto select if place session already exists

## [2026-03-12] - root@0.15.0, @chatic/web@0.12.0

### Features

- (web-core) add cloudCore, calcSignature util, useDynamicProfile hook
- (auth) add refreshCloudToken API and useRefreshCloudToken hook
- (socket) replace useSocketAuth with useCloudTokenRefresh for token refresh
- (users) add issueCloudDelegationToken API
- (home) add usePlaceSession hook and getPlaceSession util
- remove simplecore

### Bug Fixes

- add stereo=place query param to usePlaces
- (home) expand PlaceList name width, add isGuest selection style
- (ui) increase input height/padding, fix safe-top default to 0px

### Refactor

- migrate auth and data fetching to webCore
- (layout) move BottomNavigation from MainLayout to HomePage and MyPage
- (mypage) rename LoginFormPage to LoginPage, split MyPageLoginRoutes
- (profile) unify profile.uid usage via useDynamicProfile across features

### Chores

- add @types/crypto-js dependency
- (mobile) temporarily hardcode webview url to localhost:5004
- (assets) add figma reference images

## [2026-03-12] - root@0.14.0, @chatic/web@0.11.0

### Features

- add my page feature with language settings
- add internationalization support

## [2026-03-12] - root@0.13.1, @chatic/web@0.10.1, @chatic/admin@0.3.1

### Refactor

- (deeplinks) use inviteCode instead of userId
- update invite link creation to use invite code as document ID
- (deeplinks) change deeplink identifier from userId to inviteCode

## [2026-03-11] - root@0.13.0, @chatic/web@0.10.0

### Features

- skip places fetch for guest users
- add internal login flow
- add AWS SigV4 request signing
- restrict channel creation for guest users
- add BottomNavigation component
- handle guest/user profile view in MyPage
- add friend UI integration (AddFriendSheet)

### Bug Fixes

- prevent duplicate mine requests in useMyChannels
- handle useLogin onComplete callback

### Refactor

- improve simpleWebCore session management

### Chores

- add image assets
- update Podfile.lock and yarn.lock

### Other

- style: update page layouts

## [2026-03-10] - root@0.12.2, @chatic/web@0.9.1

### Refactor

- simplify modal logic and styling

## [2026-03-10] - root@0.12.1, @chatic/landing@0.3.1

### Chores

- update icons and images

## [2026-03-10] - root@0.12.0, @chatic/web@0.9.0

### Features

- update app/web message
- extend LogTag
- implement permission service
- implement device control service
- add useDeviceHandler hooks
- implement web/app message about permission
- implement usePermissionHandler
- add DeviceTestScreen
- update AppWebView
- add new bridge messages to MainScreen
- update webview component
- update bridge method
- implement BridgeTestScreen

### Refactor

- replace export path
- update messageStore
- add case that picker canceled in openDocument func

### Chores

- add dependencies
- add device permissions
- revise app/web message type field
- bump version 0.5.0

## [2026-03-10] - root@0.11.0, @chatic/landing@0.3.0

### Features

- update logo
- (landing) add Open Graph and Twitter Card metadata

### Refactor

- (deeplink) simplify desktop UI

## [2026-03-09] - root@0.10.0, @chatic/web@0.8.0

### Features

- support dynamic WebSocket endpoint via localStorage and RN bridge
- add places lib with api, hooks, and types
- add registerDevice api and hook to auth lib
- add useDynamicDeviceId hook to resolve deviceId by environment
- integrate PlaceList with usePlaces in HomePage
- add isGuest computed state to useSimpleWebCore

### Bug Fixes

- use function call instead of value reference in inviteLink
- inject safe area CSS variables via injectJavaScript on insets change
- set profile from server response after login
- update fetchPlaces endpoint

### Refactor

- replace LoginPage with auto login, move token login to TokenTestLoginPage

### Other

- style: update styles
- revert: restore webviewUrl to original value

## [2026-03-09] - root@0.9.0, @chatic/admin@0.3.0, @chatic/landing@0.2.0

### Features

- update light theme to landing
- update landing page for deeplink
- initialize env from URL query params

### Refactor

- remove debug logs
- handle deferred deeplink test data
- update displayName and displayId logic

## [2026-03-09] - root@0.8.1, @chatic/web@0.7.1

### Features

- (onboarding) add app screenshot images to onboarding steps

### Chores

- update primary color scheme

## [2026-03-09] - root@0.8.0, @chatic/landing@0.1.0

### Features

- support desktop browser
- add continue in browser button

### Refactor

- (deeplink) add new exports

## [2026-03-09] - root@0.7.0, @chatic/web@0.7.0

### Features

- publish page

### Refactor

- extract success components for room and workspace creation

## [2026-03-08] - root@0.6.0, @chatic/web@0.6.0

### Features

- add onboarding modal

### Refactor

- simplify onboarding logic and improve modal animation
- refactor onboading

## [2026-03-06] - root@0.5.0, @chatic/web@0.5.0

### Features

- implement dynamic storage adapter with native DB caching for mobile

### Bug Fixes

- send read on mount using channel lastChat$.chatNo

## [2026-03-05] - root@0.4.0, @chatic/web@0.4.0, @chatic/admin@0.2.0

### Features

- setup landing app folder
- migrate landing from clipbiz
- setup landing
- update landing page
- integrate deeplink to landing
- centralize favicon

### Other

- ci: add landing project to deploy workflows

## [2026-03-05] - root@0.3.0, @chatic/web@0.3.0

### Features

- add useDeleteChannel, handle channel-deleted event in ChatRoomPage and useMyChannels
- add 10s timeout and retry to useMyChannels channel list
- add delete loading state, skip duplicate join create events

### Chores

- bump chatic-sockets-api to 0.26.123 and update lock files

## [2026-03-04] - root@0.2.0, @chatic/web@0.2.0

### Features

- update lastChat$ in channel list on send/receive message
- improve chat UX - system message style, member count badge, read event handling
- emit auth token on websocket reconnect

## [2026-03-04] - No version updates

### Features

- (auth) add support for oauth endpoint override

### Refactor

- (api) update invite login endpoint
- (auth) update login with invite code logic

## [2026-03-04] - root@0.1.0, @chatic/web@0.1.0, @chatic/admin@0.1.0

### Features

- update invite code on admin
- (deeplinks) add alias and type to CreateDeeplinkDialog
- (deeplinks) add support for invite links with environment variables

All notable changes to this project will be documented in this file.
