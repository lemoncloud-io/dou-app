# Changelog

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
