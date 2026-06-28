# 게이트웨이 요청/응답 레퍼런스

Date: 2026-06-23

> `@lemoncloud/chatic-sockets-lib`이 export하는 도메인 게이트웨이의 **요청 입력·응답 타입** 레퍼런스(deprecated 제외).
> 라이브러리 동작 메커니즘은 [library-internals.md](library-internals.md), 앱 사용 패턴은 [usage.md](usage.md) 참조.

---

- 응답 View는 라이브러리 registry상 `unknown`(pass-through)이지만 실제 타입은 `@lemoncloud/chatic-socials-api`(`$socials`) / `@lemoncloud/chatic-backend-api`(`$backend`) 또는 로컬(`src/lib`)에 존재한다. 아래는 그것을 해석한 값이다.
- 호출부에서 제네릭으로 응답 타입을 주입한다: `chat.send<ChatView>(...)`.
- 모든 `View`는 베이스 공통 필드 보유: **`id, createdAt?, updatedAt?, deletedAt?`**(+`stereo?`). 표는 그 외 도메인 고유 필드만 표기.
- `ListResult<T>` = `{ total?, limit?, page?, took?, list: T[] }`.
- **요청 컬럼은 import 가능한 Input 타입 별칭**(`@lemoncloud/chatic-sockets-lib` export)을 기준으로 표기하고, 옆에 실제 필드 형태를 함께 적는다. Input은 모두 `InferSocketRequest<'<domain>.<action>'>`로 정의된다.

## auth (`createAuthGateway`)

라이브러리에 응답이 **구체 타입으로 박혀 있는 유일한 도메인**(pass-through 아님).

| 메서드   | action        | 요청 Input        | (필드)                | 응답                 |
| -------- | ------------- | ----------------- | --------------------- | -------------------- |
| `update` | `auth.update` | `AuthUpdateInput` | `{ token?, dryRun? }` | `AuthUpdateResponse` |

`AuthUpdateResponse`(=`AuthUpdateResponseData`) = `{ connId?, deviceId?, authId?, memberId?, state?, stateAt?, error?, member$?: { id?, name? } }`
`state`: `'' | 'pending' | 'validating' | 'authenticated' | 'failed' | 'disconnected'`

## device (`createDeviceGateway`)

로컬 `DeviceView`로 타입 확정.

| 메서드 | action        | 요청 Input        | (필드)                                             | 응답                                    |
| ------ | ------------- | ----------------- | -------------------------------------------------- | --------------------------------------- |
| `save` | `device.save` | `DeviceSaveInput` | `DeviceBody`(=Partial\<DeviceView\>)               | `DeviceSaveResponseData`(=`DeviceView`) |
| `read` | `device.read` | `DeviceGetInput`  | `{ id? } \| null` (없으면 현재 연결)               | `DeviceGetResponseData`(=`DeviceView`)  |
| `sync` | `device.sync` | `DeviceSyncInput` | `{ id?, tick?, viewingType?, viewingId? } \| null` | **void**(send, 응답 없음)               |

`DeviceView` = `{ id?, name?, platform?, status?, tick?, posX?, posY?, lastActiveAt?, connectedAt?, disconnectedAt?, connId?, viewingType?, viewingId?, viewingSince? }`
`status`: `'' | 'green' | 'red' | 'yellow'` · `platform`: `'' | 'ios' | 'android' | 'web' | 'macos' | 'windows' | 'linux'` · `viewingType`: `'' | 'channel'`
※ `save`의 `tick`은 서버가 무시.

## chat (`createChatGateway`) — 응답 `$socials`

| 메서드   | action        | 요청 Input        | (필드)                                            | 응답             |
| -------- | ------------- | ----------------- | ------------------------------------------------- | ---------------- |
| `send`   | `chat.send`   | `ChatSendInput`   | `{ channelId, content, contentType?, parentId? }` | `ChatView`       |
| `get`    | `chat.get`    | `ChatGetInput`    | `{ id }`                                          | `ChatView`       |
| `read`   | `chat.read`   | `ChatReadInput`   | `{ channelId, chatNo }`                           | `JoinView`       |
| `feed`   | `chat.feed`   | `ChatFeedInput`   | `{ channelId, cursorNo?, limit? }`                | `ChatFeedResult` |
| `update` | `chat.update` | `ChatUpdateInput` | `{ id, content?, contentType? }`                  | `ChatView`       |
| `delete` | `chat.delete` | `ChatDeleteInput` | `{ id }`                                          | `ChatView`       |

`ChatView` = `{ id?(="채널:chatNo"), stereo?, chatNo?, content?, contentType?, channelId?, ownerId?, parentId?, readCount?, memberNo?, hidden?, owner$?: UserView, channel$?: ChannelView, parent$?: ChatView }` · `stereo`: `'text'|'join'|'leave'|'system'`
`JoinView` = `{ id?(="채널@user"), channelId?, userId?, chatNo?(읽은 커서), joinedNo?, nick?, role?, notify?, joined? }`
`ChatFeedResult` = `{ list: ChatView[](내림차순), cursorNo(다음 커서, 0=끝), total(채널 최신 chatNo), limit, readNo(내 읽음 경계) }`

## channel (`createChannelGateway`) — 응답 `$socials`

| 메서드            | action                          | 요청 Input                    | (필드)                                        | 응답                            |
| ----------------- | ------------------------------- | ----------------------------- | --------------------------------------------- | ------------------------------- |
| `create`          | `channel.create`                | `ChannelCreateInput`          | `{ stereo, name? }`                           | `ChannelView`                   |
| `update`          | `channel.update`                | `ChannelUpdateInput`          | `{ channelId, name?, desc?, thumbnail? }`     | `ChannelView`                   |
| `delete`          | `channel.delete`                | `ChannelDeleteInput`          | `{ channelId }`                               | `ChannelView`                   |
| `join`            | `channel.join`                  | `ChannelJoinInput`            | `{ channelId }`                               | `JoinView`                      |
| `leave`           | `channel.leave`                 | `ChannelLeaveInput`           | `{ channelId, userId? }`                      | `ChannelView`                   |
| `getSelf`         | `channel.get-self`              | `ChannelGetSelfInput`         | `{}` / null                                   | `ChannelView`                   |
| `mine`            | `channel.mine`                  | `ChannelMineInput`            | `{ page?, limit?, detail?, hasSite? }` / null | `ListResult<ChannelView>`       |
| `listUser`        | `channel.list-user`             | `ChannelListUserInput`        | `{ channelId, limit?, page?, detail? }`       | `ListResult<UserView>`          |
| `invite`          | `channel.invite`                | `ChannelInviteInput`          | `{ channelId, userIds[] }`                    | `ChannelView`                   |
| ~~`updateJoin`~~  | ~~`channel.update-join`~~       | ~~`ChannelUpdateJoinInput`~~  | ~~`{ channelId, joinId?, nick?, notify? }`~~  | **deprecated → `join.update`**  |
| `unreads`         | `channel.unreads`               | `ChannelUnreadsInput`         | `{}` / null                                   | `UnreadsSummaryView`            |
| `sync`            | `channel.sync`                  | `ChannelSyncInput`            | `{ since? }`                                  | `ChannelSyncView`               |
| `syncUsers`       | `channel.sync-users`            | `ChannelSyncUsersInput`       | `{ channelId, since? }`                       | `ChannelUsersSyncView`          |
| ~~`syncProfile`~~ | ~~`channel.sync-site-profile`~~ | ~~`ChannelSyncProfileInput`~~ | —                                             | **deprecated → `profile.sync`** |

> 참고: `ChannelGetInput`(`channel.get`, `{ id? }` → `ChannelView`)은 게이트웨이에 메서드로 노출되진 않지만 registry에 존재하며, `ChatSyncPlan`/`ChannelSyncPlan`이 `client.request('channel.get', …)`로 직접 사용한다.

`ChannelView`(고유) = `{ stereo?, name?, desc?, inviteRule?, thumbnail?, memberIds?[], chatNo?(최신 시퀀스), ownerId?, owner$?: UserView, lastChat$?: ChatView, unreadCount?, $join?: JoinView, $joins?: JoinView[] }` · `stereo`: `'' | 'dm' | 'self' | 'public' | 'private'`
`UserView`(고유) = `{ stereo?, name?, nick?, thumbnail?, loginId?, identityId?, channelIds?[], $join?: JoinView }`
`ChannelSyncView` = `{ list: ChannelView[](since 이후 변경분), ids: string[](활성 채널 전체, 삭제감지), syncedAt }`
`ChannelUsersSyncView` = `{ list: UserView[](변경 멤버), ids: string[](활성 멤버 전체), syncedAt }`
`UnreadsSummaryView` = `{ total, channels, sites: { [sid]: { name, unreadNo, channels, updatedAt } } }`
`notify`: `'' | 'all' | 'mention' | 'none'`

## profile (`createProfileGateway`) — 응답 `$socials`

| 메서드    | action             | 요청 Input            | (필드)                                                     | 응답                  |
| --------- | ------------------ | --------------------- | ---------------------------------------------------------- | --------------------- |
| `get`     | `profile.get`      | `ProfileGetInput`     | `{ id }`(id=`siteId@userId`)                               | `ProfileView`         |
| `getMine` | `profile.get-mine` | `ProfileGetMineInput` | `{}` / null                                                | `ProfileView`         |
| `set`     | `profile.set`      | `ProfileSetInput`     | `{ id?, userId?, siteId?, nick?, thumbnail?, active?, … }` | `ProfileView`         |
| `sync`    | `profile.sync`     | `ProfileSyncInput`    | `{ since? }`                                               | `SiteProfileSyncView` |

`ProfileView` = `{ id?(=`sid@uid`), userId?, siteId?, nick?, thumbnail?, active?: boolean }`
`SiteProfileSyncView` = `{ profiles: { [uid]: { nick?, thumbnail?, updatedAt? } | null(reset) }, syncedAt }` (key 부재=변경없음)

## join (`createJoinGateway`) — 응답 `$socials` (v0.3.4~)

1급 join 도메인 게이트웨이. 단일 join 스냅샷 조회/수정을 담당하며, `JoinSyncPlan`이 `get`을 polling 한다. id는 클라이언트가 보관한 composite join id를 그대로 전달한다.

| 메서드   | action        | 요청 Input              | (필드)                          | 응답       |
| -------- | ------------- | ----------------------- | ------------------------------- | ---------- |
| `get`    | `join.get`    | `JoinGetRequestBody`    | `{ id }`                        | `JoinView` |
| `update` | `join.update` | `JoinUpdateRequestBody` | `{ id, nick?, notify?, role? }` | `JoinView` |

`JoinView` = `{ id?, channelId?, ownerId?, stereo?, chatNo?, joined?, updatedAt? }` · `JoinSyncPlan`은 `updatedAt` 변화 기준으로 `onUpdate`를 호출한다.
보조 command 경계: 읽음 처리는 `chat.read`(chat), 채널 참여는 `channel.join`(channel)으로 유지한다.

## place(site) (`createPlaceGateway`) — 응답 `$backend`

| 메서드   | action         | 요청 Input         | (필드)                                | 응답         |
| -------- | -------------- | ------------------ | ------------------------------------- | ------------ |
| `create` | `place.create` | `PlaceCreateInput` | `{ name?, stereo?, thumbnail? }`      | `MyUserView` |
| `get`    | `place.get`    | `PlaceGetInput`    | `{ id }`                              | `MySiteView` |
| `update` | `place.update` | `PlaceUpdateInput` | `{ id?, name?, stereo?, thumbnail? }` | `MySiteView` |
| `delete` | `place.delete` | `PlaceDeleteInput` | `{ id }`                              | `MySiteView` |

`MySiteView` = `SiteView{ name?, nick?, ownerId?, owner$? }` + `{ ownerId?, thumbnail?, isOwner?: boolean }`
`MyUserView` = `UserView` + `{ accountId?, account$?, referrerId?, referrer$?, userStatus?, memo?, site$$?: MySiteView[] }`

## cloud (`createCloudGateway`) — 응답 `$backend`

| 메서드   | action         | 요청 Input         | (필드)                                  | 응답                                          |
| -------- | -------------- | ------------------ | --------------------------------------- | --------------------------------------------- |
| `create` | `cloud.create` | `CloudCreateInput` | `{ name? }`                             | `CloudView` — **미구현(500 NOT IMPLEMENTED)** |
| `get`    | `cloud.get`    | `CloudGetInput`    | `{ id }`                                | `CloudView`                                   |
| `update` | `cloud.update` | `CloudUpdateInput` | `{ id?, name? }` (`cloudId` deprecated) | `CloudView`                                   |
| `delete` | `cloud.delete` | `CloudDeleteInput` | `{ id }`                                | `CloudView`                                   |

`CloudView`(주요) = `{ stereo?, ownerId?, owner$?, email?, accountId?, status?, expiresAt?, region?, stage?, cloudNo?, workspaceId?, slotId?, $envs?, … }` (구독/배포 메타 다수)

## user (`createUserGateway`) — 응답 `$socials`/`$backend`

| 메서드               | action                      | 요청 Input                    | (필드)                                       | 응답                               |
| -------------------- | --------------------------- | ----------------------------- | -------------------------------------------- | ---------------------------------- |
| `update`             | `user.update-profile`       | `UserUpdateProfileInput`      | `{ name?, nick?, thumbnail? }`               | `UserView`                         |
| `mySite`             | `user.my-site`              | `UserMySiteInput`             | `{}` / null                                  | `ListResult<MySiteView>`           |
| `invite`             | `user.invite`               | `UserInviteInput`             | `{ channelId?, name, phone }`                | `MyInviteView`                     |
| `inviteBatch`        | `user.invite-batch`         | `UserInviteBatchInput`        | `{ to[], channelId?, cloudId?, cloudName? }` | `ListResult<MyInviteView>`         |
| ~~`makeSite`~~       | ~~`user.make-site`~~        | ~~`UserMakeSiteInput`~~       | —                                            | **deprecated → `place.create`**    |
| ~~`updateSite`~~     | ~~`user.update-site`~~      | ~~`UserUpdateSiteInput`~~     | —                                            | **deprecated → `place.update`**    |
| ~~`getSiteProfile`~~ | ~~`user.get-site-profile`~~ | ~~`UserGetSiteProfileInput`~~ | —                                            | **deprecated → `profile.getMine`** |
| ~~`setSiteProfile`~~ | ~~`user.set-site-profile`~~ | ~~`UserSetSiteProfileInput`~~ | —                                            | **deprecated → `profile.set`**     |

`MyInviteView` = `InviteView` + `{ phone?, channelId?, inviterId?, inviter$?, mid?, $envs? }`
