# Invite Flow (초대)

testbed에서 초대 생성 → 코드 복사 → 수락 → 타겟(cid/sid/channelId) 순차 전환 입장까지의 흐름.

## 구성

| 항목             | 위치                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| 초대 코드 codec  | `features/invite/inviteCode.ts` (`encodeInvite`/`decodeInvite`)           |
| 초대 생성 팝업   | `features/invite/InviteCreateDialog.tsx` (CreateChannel 헤더 "초대" 버튼) |
| 초대 수락 페이지 | `pages/InvitePage.tsx` — 라우트 `/invite`                                 |

## 초대 코드(번들) 형식

딥링크 인프라가 없으므로 수락에 필요한 값을 **base64(JSON)** 한 덩어리로 묶어 복사한다.

```ts
interface InvitePayload {
    code: string; // requestInvite가 발급한 verify code(uuid)
    cid: string; // 타겟 cloud id (초대자의 현재 cloud)
    sid: string; // 타겟 site id
    channelId: string; // 입장할 channel
    backend?: string; // cloud REST endpoint (login-invite)
    wss?: string; // cloud WebSocket endpoint
    cloudName?: string; // 표시용(없으면 login 응답 name 사용)
}
```

`decodeInvite`는 base64/JSON 파싱 실패나 필수 필드(code/cid/sid/channelId) 누락 시 `null`을 반환해, 절반만 전환되는 상황을 막는다.

## 1) 초대 생성 (CreateChannel)

1. 채팅방 헤더 "초대" → `InviteCreateDialog`.
2. `name`, `phone` 입력 → `repos.user.requestInvite({ channelId, name, phone })`.
    - 반환 `MyInviteView`: `code` / `siteId`(sid) / `channelId` / `$envs`(backend·wss).
3. `cid`는 초대자의 현재 세션(`activeServer.cloudId`)으로 채운다(반환에 cloudId가 없을 수 있음). sid/endpoint는 invite 값 우선, 없으면 세션 폴백.
4. `encodeInvite(payload)` 결과를 표시 + 복사(`navigator.clipboard`, 실패 시 textarea 선택).

## 2) 초대 수락 (/invite)

수락자는 **relay 게스트**(`delegatorId` 보유) 상태여야 한다. 코드 붙여넣기 → `decodeInvite` →
`useInviteFlow.runInviteFlow({ code, backend, wss, cloudName, onSaveInviteCloud })`:

- `loginWithInviteCode(code, delegatorId, backend)` → invited cloud 저장(`onSaveInviteCloud`).
- **`cloudId`는 의도적으로 넘기지 않는다** → `useInviteFlow`가 `switchCloudSession`(delegate 교환)을 건너뛴다.

### 수락은 login + 저장까지, 입장은 ChatHome 수동 선택

수락 단계에선 자동 전환을 하지 않고 inviteCloud만 저장한다. 사용자가 **ChatHome에서 초대 클라우드를
선택**하면 일반 `switchCloud`로 입장한다.

> ⚠️ 입장이 되려면 캐시에 저장하는 초대 클라우드 **id가 target cid(번들 `cid` = 실제 cloud id)** 여야 한다.
> login 응답의 `data.cloudId`는 **AWS account-no**라 그것을 switch 대상으로 쓰면
> `issueCloudDelegationToken: refusing AWS account-no as cloud target`로 거부된다.
> 따라서 `cacheWrite({ id: payload.cid, ... })`로 저장한다.

번들의 `sid`/`channelId`는 보존되나 현재 자동 전환에는 사용하지 않는다(후속: 입장 후 sid/channel 자동 이동 여지).

## 3) inviteCloud DB 저장

`onSaveInviteCloud`에서 `repos.cloud.cacheWrite({ id, name, backend, wss, cloudType: 'invited' })`.

- cloud 캐시는 **global 파티션**이라 cloud 전환에도 유지되어, ChatHome "초대 클라우드" 목록과 DBBrowser `invitecloud` 탭에 노출된다.
- `useInviteFlow`가 `switchCloud` **전에** 저장을 호출하므로 게스트(relay) 스코프에 기록된다.

## 제약 / 비고

- `requestInvite`는 `name`+`phone`을 요구한다(타겟 지정). 단건 초대만 사용(`requestInviteBatch` 미사용).
- login-invite의 `code`는 `MyInviteView.Location`(딥링크) 안의 `code` 파라미터다. raw `InviteModel.code`(uuid)를 넘기면 `400 INVALID … is invalid (format)`. `parseInviteLocation`으로 추출한다.
- web-core dist 타입이 stale하여 `runInviteFlow` 호출부는 캐스팅으로 처리(런타임 src는 wss/onSaveInviteCloud 지원).
- 수락자가 게스트가 아니면(`delegatorId` 없음) 안내 후 중단 — 로그인 페이지에서 게스트 입장 필요.
- **자동 입장 제외**: invited cloud는 delegate 불가 → 수락은 login+저장까지, 입장은 ChatHome 수동 선택.

## 검증

- 유닛: `inviteCode.test.ts` (라운드트립·가드).
- 수동(2세션): A가 CreateChannel에서 코드 생성·복사 → B(게스트)가 `/invite`에서 붙여넣기·수락 → cid→sid→channelId 전환 후 방 입장, ChatHome 초대 클라우드 목록/`invitecloud` 캐시 확인.

## 관련 문서

- [README.md](README.md) — 설정/세션 제어 페이지
- [../chat/README.md](../chat/README.md) — ChatHome에서 초대 클라우드 선택·입장
- [../overlay/README.md](../overlay/README.md) — `invitecloud` 캐시 확인
