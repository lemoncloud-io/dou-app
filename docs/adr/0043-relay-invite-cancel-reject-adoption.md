# ADR-0043: 중계 초대 취소·거절을 실 API로 전환한다

> 상태: Accepted · 결정일: 2026-08-04
>
> 관련: [ADR-0033](0033-relay-dm-invite-and-auth-parallel-tracks.md)(트랙 구조와 스텁 선반영 원칙) ·
> [ADR-0016](0016-invite-accept-popup-web-ui-kit.md)(수락 팝업 케이스 다이얼로그) ·
> [ADR-0037](0037-invite-accept-popup-group-and-dm-variants.md)(수락 팝업 변형).
> 본 ADR은 ADR-0033을 뒤집지 않는다 — 그 문서가 "백엔드 요청 1·2번"으로 미뤄 둔 자리가 채워진 것이다.

> **이름 안내 (2026-09-01):** 이 문서가 쓰는 `*RemoteDataSource` · `RemoteGatewayBundle` · `*DomainGateway` · `remoteFactory` · `remote/data-sources/`는 **당시 이름**이다. 소켓 축이 `Socket` 접두로 옮겨간 뒤의 대응표는 [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#이름-규약-2026-09-01-리네임)에 있다. 기록이므로 본문은 그대로 둔다.

## 맥락 (Context)

로드맵(`docs/plans/relay-dm-invite-parallel-roadmap.md`)의 **백엔드 요청 1번(취소)·2번(거절)이 도착했다.**

- `@lemoncloud/chatic-sockets-lib@0.4.13` — `InviteGateway`에 `cancel`·`reject` 추가
- `@lemoncloud/chatic-sockets-api@0.26.710` · `@lemoncloud/chatic-backend-api@0.26.709`
- 스펙 원본: `chatic-sockets-api/docs/specs/relay-server-invite` (01-spec Rev 2026-08-04, 05-client-guide 동일 Rev)

### 스펙이 확정한 계약 (앱이 따를 것)

- **상태는 다섯이다** — `pending`·`accepted`·`canceled`·`rejected`·`expired`(`MyInviteStatus`).
  `invite.list`의 `state` 필터도 같은 집합을 받는다.
- **네이밍 주의**: 백엔드 `InviteModel.state`의 저장값은 `'cancel' | 'reject'`지만, 앱이 보는
  `MyInviteView.state` 파생값은 `'canceled' | 'rejected'`다. 앱의 선반영 코드
  (`inviteStatus.ts`의 `REJECTED_STATE = 'rejected'`)와 일치하므로 그대로 맞는다.
- **취소는 자기 초대만** — 인가는 코드가 아니라 세션 소유권. 남의 초대 `403`, 이미 수락 `409`,
  만료 초대는 취소 가능(목록 정리).
- **거절은 코드 보유만으로** — 번호 인증(`needVerify`) 불요. 디바이스 유저가 딥링크 직후 바로 누른다.
- **멱등** — 이미 종국인 초대에 재호출해도 성공이고 시각(`canceledAt`·`rejectedAt`)이 밀리지 않는다.
  클라이언트가 재시도를 막지 않아도 된다.
- **응답의 `state`로 끝난다** — 재확인 조회가 필요 없다. `409`(이미 수락)는 상태가 갈렸다는 뜻이므로
  목록·카드를 다시 불러 화면을 맞춘다.
- **알림은 여전히 없다**(요청 4번 미구현) — 초대자 화면은 `invite.list` 재조회(폴링)로 갱신한다.
- **되돌리기 없다** — 재발급(`invite.create`)이 그 자리다. 백엔드 자동취소(요청 3번)도 만들지 않았다.

### 앱의 현재 상태 — 스텁이 자리를 비워 두고 있다

트랙 통합(2026-07-29) 시점에 인터페이스 선반영으로 만들어 둔 것들:

| 표면                                                                        | 현재 동작                                                                    | 게이트                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| 취소 버튼 (`InviteWaitingPage`)                                             | 확인 다이얼로그까지 구현, **로컬 숨김만**(`useLocallyCanceledInvites`)       | `INVITE_CANCEL_API_SUPPORTED = false`             |
| 거절 버튼 (`InviteAcceptScreen`)                                            | **닫기 + 로컬 기록만**(`relayInviteDecline.ts`) — 기록을 읽는 곳이 없는 반쪽 | `RELAY_INVITE_DECLINE_ENABLED = true`             |
| 거절됨 뱃지·재초대 카피 (`InviteChannelRow`·`ReinviteDialog` declined 변형) | **완성돼 있으나 도달 불가**                                                  | `INVITE_REJECTED_STATE_SUPPORTED = false`         |
| 재발급 카피                                                                 | "이전 초대가 살아 있다" 전제로 조정                                          | `INVITE_AUTO_REVOKE_ON_REISSUE_SUPPORTED = false` |
| 수신자 취소 케이스                                                          | 취소를 구분 못 해 "유효하지 않은 초대"에 **문구 통합**                       | — (Figma `3079-12304` 대기)                       |

단, 로드맵의 "플래그 반전이 변경의 전부"는 목록에서 깨진다 —
`useInviteListRows`의 필터가 `pending`·`expired`만 통과시켜서, 거절됨 뱃지가 살려면
`rejected`도 통과해야 한다.

### 인터뷰에서 확정한 것 (2026-08-04)

1. 재발급 시 기존 초대 자동 취소를 **이번 범위에 포함** — 클라이언트가 `cancel → create`로 조합.
2. 예전에 로컬로만 취소해 둔 초대(`canceledInviteIds`)는 **서버에 반영(reconcile) 후 폐기**.
3. 거절 버튼에 **확인 다이얼로그 추가** — Figma `3446-17487`.
4. 수신자 딥링크 진입 케이스는 기존 케이스 다이얼로그 시안 체계를 따른다 —
   `3077-11719`(만료) · `3078-12015`(이미 참여) · `3079-12154`(채팅방 삭제, 미배선 유지) ·
   `3079-12304`(초대 취소됨, 이번에 되살림) · `3446-17487`(거절 확인).

## 결정 (Decision)

### 포함

1. **버전 범프** — `chatic-sockets-lib 0.4.12→0.4.13`, `chatic-sockets-api 0.26.709→0.26.710`,
   `chatic-backend-api ^0.26.706→0.26.709`.
2. **배선 관통** — `InviteDomainGateway`의 `Pick`(`libs/data/src/data/remote/gateways/index.ts`)에
   `cancel`·`reject` 추가 → `InviteRemoteDataSource` → `InviteRepositoryV2` →
   `useRelayInviteMutations`에 `cancelInvite(code)`·`rejectInvite(code)`. 기존 create/get/accept와
   같은 결로만 넓히고, 데이터 레이어 구조는 건드리지 않는다(ADR-0036은 별도 대기).
3. **취소 스텁 교체** — `InviteWaitingPage`의 `markCanceled`(로컬 숨김)를 실제 `invite.cancel`로.
   응답 `state === 'canceled'`로 판정하고 카드를 지운다. `409`(이미 수락)면 목록을 다시 불러 화면을 맞춘다.
4. **거절 실 API + 확인 단계** — 거절 버튼 탭 → 확인 다이얼로그(Figma `3446-17487`, 기존
   `ConfirmDialog` 패턴) → `invite.reject` → `state === 'rejected'`면 닫고 홈. 인증 스텝을 거치지
   않는 위치(딥링크 직후)는 현행 그대로다.
5. **재발급 = cancel 후 create** — "초대 다시 하기"는 기존 pending·expired 초대를 먼저 `cancel`하고
   새로 `create`한다. cancel이 `409`(이미 수락)로 지면 재발급을 중단하고 목록을 갱신한다 —
   방이 이미 생겼다는 뜻이다. 옛 링크로 수락되는 반쪽 동작이 이것으로 닫힌다.
6. **수신자 케이스 다이얼로그 정비** — `invite.get`의 `state` 분기에서 `canceled`를
   "유효하지 않은 초대"에서 분리해 Figma `3079-12304` 문구를 되살리고, `rejected` 재진입
   케이스("거절한 초대입니다", 스펙 B-1 표)를 같은 AlertDialog 패턴으로 추가한다.
   전용 시안이 나오면 카피만 맞춘다.
7. **목록 노출 규칙** — `useInviteListRows` 필터를 `pending`·`expired`·`rejected` 통과로 넓힌다.
   `rejected` 행은 거절됨 뱃지 → 탭 → `ReinviteDialog` declined 변형(이미 완성된 경로).
   `canceled`는 목록에서 숨긴다 — 현행 UX 유지, 필터가 자연히 거른다.
8. **로컬 잔재 청산** —
    - `canceledInviteIds`: 목록 로드 후 기록이 있고 서버가 아직 종국이 아닌 초대에 `invite.cancel`을
      발사(reconcile). 성공·`409` 모두 기록을 지운다. 멱등이라 재시도 안전. 기록이 소진되면
      reconcile 코드와 스토어·프리퍼런스 키는 후속 릴리스에서 제거한다.
        > **보충(2026-08-04, 스펙 단계에서 확정·사용자 비준):** 스토어 완전 제거는 철회한다.
        > `rejected`가 서버에 영구 보존되고 만료로 퇴화하지 않아(backend `asInviteState` 우선순위),
        > 재초대 후 거절 행을 걷어낼 서버 수단이 없다 — `canceledInviteIds`는 "거절 행 로컬 dismiss
        > 마커"라는 좁은 역할로 존속한다. legacy 기록의 reconcile·소진은 그대로다. 상세는
        > `apps/web/docs/feature/invite/relay-invite-sender.md`의 retire 규칙.
    - `declinedInviteIds`: **즉시 폐기**(스토어·키 삭제). 읽는 곳이 없던 반쪽 스텁이고, 이제
      `invite.get`이 `rejected`를 돌려주므로 서버 상태가 그 역할을 대체한다.
9. **플래그·스텁 삭제** — `INVITE_CANCEL_API_SUPPORTED`·`INVITE_REJECTED_STATE_SUPPORTED`·
   `RELAY_INVITE_DECLINE_ENABLED`·`INVITE_AUTO_REVOKE_ON_REISSUE_SUPPORTED` 네 플래그와
   죽는 분기(`useLocallyCanceledInvites`, `relayInviteDecline.ts`, 스텁 카피 스왑)를 **반전이 아니라
   삭제**한다. 플래그의 존재 이유가 "백엔드 갭"이었고 갭이 사라졌다.
10. **계약 문서 갱신** — 로드맵 "인터페이스 계약"의 `state` 유니온을 5종으로 넓히고
    `cancelInvite`·`rejectInvite` 시그니처를 추가한다("계약을 바꾸면 로드맵 문서부터 고친다" 규칙).
    `apps/web/docs/feature/invite/relay-invite-accept.md`의 스텁 서술(§6·§8)도 함께 갱신.

### 제외

- **수락·거절·취소의 초대자 알림** — 백엔드 요청 4번이 여전히 미구현. 30초 `invite.list` 폴링 유지.
- **취소·거절 되돌리기** — 서버 경로가 없다. 재발급이 그 자리.
- **`canceledAt`·`rejectedAt` 시각 카피**("어제 취소함") — 뷰에 이미 오지만 이번 화면 요구에 없다. 후속.
- **채팅방 삭제됨(`3079-12154`) 배선** — relay 트리거가 없어 현행(미배선) 유지.
- **데이터 레이어 리팩토링** — [ADR-0036](0036-data-surface-unification-app-runtime-cleanup.md)은
  본 작업 뒤에 착수한다. 이번 배선은 기존 repositories-v2 패턴 안에서만 움직인다.

## 대안 (Alternatives)

- **로컬 취소 잔재를 그냥 폐기 / 읽기만 유지** — 폐기하면 예전에 취소한 초대가 목록에 되살아나고,
  읽기만 유지하면 서버와 영원히 어긋난 잔재가 남는다. reconcile은 사용자의 원래 의도(취소)를
  서버에 반영하고, 멱등이라 안전하며, 소진 후 코드까지 지울 수 있어 채택.
- **declined 잔재도 reconcile(자동 reject 발사)** — 버림. 거절 스텁의 실제 UX는 "닫기"에
  가까웠고, 종국 액션을 사용자 재확인 없이 자동 발사하는 것은 과하다. 재진입하면 다시 거절하면 된다.
- **재발급 조합을 다음 작업으로** — 버림. 옛 링크가 살아 있는 반쪽 동작은 이번 작업이 풀려는
  문제(취소의 서버 반영)와 같은 축이고, cancel API가 생긴 지금이 비용이 가장 싸다.
- **플래그를 반전만 하고 유지** — 버림. 갭이 사라진 플래그는 죽은 분기를 영구 보존할 뿐이다.
  양 분기를 테스트하던 리졸버(`resolveInviteRowBadge` 등)는 단일 경로로 접는다.
- **백엔드 자동취소(요청 3번)를 기다림** — 버림. 스펙이 "재발급이 그 자리"라고 명시적으로
  경로를 닫았다.

## 결과 (Consequences)

**얻는 것**

- 취소·거절의 반쪽 동작 해소 — 취소가 서버에 반영돼 수신자의 옛 링크 수락이 막히고,
  거절이 초대자에게 상태(`rejected` 뱃지·재초대 declined 카피)로 전달된다.
- 로컬 스텁 스토어 2종·플래그 4종·스텁 모듈 삭제로 코드 표면 축소.
- 수신자 진입 케이스 화면이 스펙 B-1 표와 1:1로 맞는다.

**감수하는 트레이드오프**

- reconcile 로직이 일시적으로 들어온다 — 잔재 소진 후 제거 전제의 마이그레이션 코드다.
- 알림 부재는 그대로라 초대자 화면 갱신은 여전히 폴링이다(요청 4번 도착 시 별도 작업).
- `rejected` 재진입 케이스는 전용 시안 없이 기존 패턴 준용으로 출발한다 — 시안이 나오면 카피 조정.
- `409` 경합 처리 표면이 취소·거절·재발급 세 곳으로 늘어난다 — 전부 "목록 재조회로 화면을
  맞춘다"라는 같은 규칙으로 수렴시킨다.

**다음 단계** — 이 ADR을 입력으로 dev-2_implement(스펙 작성 → 구현) 세션을 새로 연다.
