# [기술 스펙 명세서] 채널 / 플레이스 관리 (생성·이름수정)

> 관련 화면: [채팅 홈 페이지](./chat-home-page.SPEC.md) (`apps/testbed/src/app/pages/ChatHomePage.tsx`)
> 구현 위치: `apps/testbed/src/app/features/manage`

## 1. 목적

채팅 홈이 cloud/place/channel을 **나열·탐색**만 하던 것에서 나아가, testbed에서 직접
place와 channel을 **생성**하고 **이름을 수정**해 쓰기 흐름(create/update)을 검증한다.

대상 작업 4가지:

- 플레이스 생성 / 플레이스 이름 수정
- 채널 생성 / 채널 이름 수정

## 2. 필수 기능

- 채팅 홈의 Place 섹션에서 새 플레이스 생성
- 각 place 항목에서 이름 수정
- 채팅 홈의 Channel 섹션에서 새 채널 생성 (활성 place가 있을 때만)
- 각 channel 항목에서 이름 수정
- 이름 입력은 공백/빈값이면 저장 불가, 실패 시 사유를 화면에 노출

## 3. 화면 구성

### 3.1 진입 버튼

- Place 섹션 헤더 우측: `+ 새 플레이스`
- Channel 섹션 헤더 우측: `+ 새 채널` (활성 place 없으면 비활성)
- 각 place / channel 행 우측: `✎`(이름 수정)

> 행 전체가 클릭 버튼(전환/진입)이므로, 수정 버튼은 버튼 중첩을 피하려고 행을
> `div`(메인 버튼 + `✎` 버튼) 구조로 분리해 배치한다.

### 3.2 이름 입력 다이얼로그 (`NameFormDialog`)

생성/수정 공용 인라인 모달. 기존 `InviteCreateDialog` / `SystemSendPanel`과 동일한
오버레이 스타일을 따른다.

표시 항목:

- 제목 (예: "새 플레이스", "채널 이름 수정")
- 이름 입력 필드 (수정은 현재 이름 프리필)
- 저장/생성 버튼 (유효하지 않으면 비활성)
- 실패 시 에러 문구

## 4. 동작 규칙

### 4.1 이름 검증

- `normalizeName(input)`(= trim 후 최소 1자) 규칙을 공용으로 쓴다 (`features/naming.ts`).
- 검증 통과 전에는 저장/생성 버튼을 비활성화한다.

### 4.2 페이로드 규칙 (`features/manage/payloads.ts`)

빌더 4종이 검증 + 페이로드 형태를 한곳에 응집한다. 유효하면 페이로드, 아니면 `null`.

| 빌더                                  | 결과                          |
| ------------------------------------- | ----------------------------- |
| `buildChannelCreate(name)`            | `{ stereo: 'private', name }` |
| `buildChannelUpdate(channelId, name)` | `{ channelId, name }`         |
| `buildPlaceCreate(name)`              | `{ name }`                    |
| `buildPlaceUpdate(placeId, name)`     | `{ id: placeId, name }`       |

- 채널 생성은 이름만 받고 `stereo`는 `private` 기본 (web `CreateChannelPage`와 동일).
- **플레이스 이름 수정은 `id` 필드로 타겟을 지정한다.** repository의 `updatePlace`가
  `payload.id`로 대상을 찾고 로컬 캐시(키=id)를 낙관 갱신하기 때문이다 —
  `sid`로 넘기면 대상 미지정으로 no-op된다.

### 4.3 repository 호출

| 작업              | 호출                                               |
| ----------------- | -------------------------------------------------- |
| 플레이스 생성     | `repos.place.createPlace({ name })`                |
| 플레이스 이름수정 | `repos.place.updatePlace({ id, name })`            |
| 채널 생성         | `repos.channel.createChannel({ stereo, name })`    |
| 채널 이름수정     | `repos.channel.updateChannel({ channelId, name })` |

### 4.4 목록 반영

- 각 repo 호출은 결과를 캐시에 write하고, 홈의 `observeList` 구독이 재emit되어
  목록이 **자동 갱신**된다. 별도 수동 refresh를 하지 않는다.
- 채널 생성은 현재 활성 place(context.sid) 범위로 생성되므로, 생성 즉시 해당
  place의 채널 목록에 나타난다.

## 5. 코드 근거

- 화면 배선: `apps/testbed/src/app/pages/ChatHomePage.tsx`
- 다이얼로그: `apps/testbed/src/app/features/manage/NameFormDialog.tsx`
- 페이로드 빌더: `apps/testbed/src/app/features/manage/payloads.ts`
- 이름 검증: `apps/testbed/src/app/features/naming.ts`
- repository 계약:
    - `libs/data/src/data/repositories-v2/ChannelRepositoryV2.ts` (`createChannel`/`updateChannel`)
    - `libs/data/src/data/repositories-v2/PlaceRepositoryV2.ts` (`createPlace`/`updatePlace`, 타겟 = `id`)

## 6. 예외 및 제약

- 활성 place가 없으면 `+ 새 채널`은 비활성 (채널은 place 범위에 생성됨).
- relay(default) / cloud 클라우드별 생성 허용 여부는 세션 스코프에 종속한다.
  실패 시 다이얼로그에 에러 문구를 노출하고 앱은 유지된다.
- 삭제·멤버 초대·thumbnail/stereo 편집은 이 범위 밖(초대는 `InviteCreateDialog` 별도).

## 7. 검증 포인트

- 빈/공백 이름이면 저장·생성 버튼이 비활성이어야 한다.
- 플레이스/채널 생성 후 목록에 새 항목이 나타나야 한다(스트림 자동 갱신).
- 이름 수정 후 해당 항목 라벨이 바뀌어야 한다.
- 플레이스 이름 수정이 `id` 기준으로 반영되어야 한다(로컬 캐시 낙관 갱신 포함).
- 실패 시 다이얼로그에 사유가 노출되고 목록/세션 상태가 깨지지 않아야 한다.

## 8. 유닛 테스트

```sh
npx vitest run apps/testbed/src/app/features/manage
```

`payloads.test.ts` — 빌더 4종의 트림/`null` 게이팅, 채널 생성 `stereo=private`,
플레이스 수정 `id` 필드 사용을 고정한다.
