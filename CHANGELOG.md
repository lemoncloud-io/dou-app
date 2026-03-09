# Changelog

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
