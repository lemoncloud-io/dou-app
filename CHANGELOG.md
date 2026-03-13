# Changelog

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
