# ADR-0036: 데이터 접근 표면 단일화 — gateway 예외 폐지와 app-runtime 구조 정리

> 상태: Accepted · 결정일: 2026-07-30 · 관련: [ADR-0033](./0033-relay-dm-invite-and-auth-parallel-tracks.md) (대안 1건 대체)

## 맥락 (Context)

특정 기능 대비가 아니라 **전반 대비**다. "모든 데이터 콜은 repository를 거친다"는
원칙 위반이 누적됐다는 체감이 있었고, `libs/data`·`libs/app-runtime/src/runtime`의
꼬인 로직 전수 점검을 원했다. 점검 결과:

**우회 인벤토리** — 앱이 `@chatic/data` 내부(gateway/data-source/storage)를 직접
import하는 사례는 0건. libs/data의 캡슐화 자체는 지켜지고 있다. 실제 우회는:

1. `useRuntimeGateways`가 invite/auth gateway 2건을 UI에 직접 노출 —
   ADR-0033이 의도적으로 남긴 예외 (`apps/web`의 `useRelayInvites`,
   `useVerifyHashAlias`, `useAttachSocial`이 소비).
2. `libs/web-core`의 axios REST 병렬 레이어 — 소비처 150+ 파일. auth/세션
   부트스트랩은 정당한 별도 관심사지만 `useUsers`·`useClouds`·subscriptions처럼
   repository 도메인과 겹치는 읽기가 섞여 있고, `libs/users`·`auth`·
   `subscriptions`가 이를 재노출해 표면을 3배로 확산.
3. `apps/desktop-web/src/app/shared/utils/readCacheRecords.ts` — repository가
   활성 클라우드 파티션만 읽게 돼 있어, 푸시 라우팅의 크로스-클라우드 조회를
   위해 raw IndexedDB를 직접 연다.
   → **2026-08-06 갱신**: 이 목적의 승인된 경로가 생겼다. app-runtime이
   `useGlobalCacheSearch().resolveContext`로 명시적 cid 기반 크로스 클라우드
   읽기를 노출한다([[global-cache-search]](../specs/cache/global-cache-search.md)).
   desktop-web을 이 경로로 옮기면 이 우회는 사라진다(별도 작업).
4. `apps/admin` — repository 아키텍처 밖의 별도 WebSocket 스택(`libs/socket`)을
   쓰는 독립 앱 (대부분 테스트 기능).
5. 디버그 화면·socket-lab·일회성 콜드 마이그레이션(`invitedCloudColdSync`의
   raw adapter) — 도구/일회성 성격.

**app-runtime 꼬임 지점** (심각도순): ① cid/스코프 부기가 6개 파일에 분산
(`useRuntimeBinding` / `DataManager.socketAwareProvider` / `SocketManager.boundCid` /
`socketRebootKey` / `plans.dropForeignFrame` / `SyncManager.isCidActive`) ② data↔
socket↔runtime이 lazy 싱글턴 접근자로만 성립하는 3자 순환 ③ 소켓 상태·sync 등록을
훅(선언형)+매니저(명령형)로 이중 소비 (15+파일) ④ 현재 사용자 프로필 획득 경로
5+종 (훅 내부도 토큰/세션/캐시 3소스 병합) ⑤ 레이어 역전 (`data/invitedCloudColdSync`가
React 훅 정의, socket plans가 data 쓰기, DataManager가 socket 조회) ⑥
RuntimeConnectionHost/RuntimeAuthHost 중복 배선 ⑦ V1 부재의 전면 V2 접미사 +
구명칭 별칭 부채 ⑧ SDK 비공개 API(start/stop) 의존.

## 결정 (Decision)

### 1. gateway 직접 노출 폐지 — repository 승격

ADR-0033의 대안 "초대 목록을 repositories-v2로 승격 — 버림"을 **대체**한다.
`useRuntimeRepositories`(캐시 경유)와 `useRuntimeGateways`(캐시 우회)라는 두 접근
표면의 공존 자체가 혼선이므로, 원칙의 단일성을 우선한다.

- relay invite → `InviteRepositoryV2` 신설. auth 커맨드(`verifyHashAlias`,
  `attachSocial`)의 귀속(신설 vs 기존 repository 확장)은 스펙 단계에서 확정.
- **승격의 목적은 접근 표면 단일화이지 영속화 의무가 아니다.** "오프라인 요구
  없음"이라는 ADR-0033의 사실 판단은 여전히 유효하며, remote-only 또는 메모리
  캐시 구현을 허용한다. repository는 "캐시"가 아니라 "유일한 데이터 접근
  표면"으로 재정의한다 (libs/data README 갱신 필요).
- `useRuntimeGateways` / `DirectGateways` 표면은 제거한다.

    > **이행 완료 (2026-07-31)** — `useRuntimeGateways`·`DirectGateways`·`getGateways`·
    > `remoteFactory`의 gateways 반출이 모두 삭제됐고, `apps/web`의 세 훅
    > (`useRelayInvites`·`useVerifyHashAlias`·`useAttachSocial`)이 `InviteRepositoryV2`/
    > `AuthRepositoryV2`로 전환됐다. 게이트웨이를 직접 잡는 경로는 남아 있지 않다.

### 2. app-runtime 구조 정리 — 점검된 꼬임 전면 채택

- **cid/스코프 부기 단일화**: 6곳에 분산된 규칙을 한 모듈로 모은다 (cross-cloud
  오염 방어의 단일 지점화).
- **3자 순환 해소**: data↔socket↔runtime 의존을 단방향 계층으로 편다.
- **레이어 역전 정리**: `data/invitedCloudColdSync`의 React 훅을 runtime 계층으로
  재배치하는 등 각 모듈의 책임 원위치.
- **profile 경로 수렴**: 5+종 경로(`useRuntimeProfile`/`useSessionProfile`/
  `useMyUser`/`getActiveSessionUser` 직접 호출/시딩 러너)를 `useRuntimeProfile`
  단일 표면으로 수렴.
- **싱글턴↔React 이중 관리 정리**: 앱이 `getSocketManager`/`getSyncManager`를
  명령형으로 만지는 표면을 줄이고 구독/등록을 선언형 API로 수렴.
- **조립 루트 통합**: RuntimeConnectionHost/RuntimeAuthHost의 중복 배선 통합.

### 3. 크로스-스코프 읽기 공식화

`readCacheRecords.ts`의 raw IndexedDB 우회는 없애는 게 아니라 **repository 계층에
크로스-스코프 읽기 API를 추가해 흡수**한다. 원칙(모든 데이터 콜은 repository)을
푸시 라우팅에도 일관 적용하기 위함이다.

### 4. 명시적 범위 제외

- **web-core REST 병렬 레이어는 일단 유지** — 도메인 중복 읽기의 repository
  이관도 이번엔 하지 않는다. 후속 검토 항목으로만 남긴다.
- **apps/admin** — 별도 스택의 독립 앱이므로 제외.
- **디버그/랩 도구, 일회성 콜드 마이그레이션** — 허용 예외로 존치.
- **V2 접미사 리네임·구명칭 별칭 정리** — 제외 (diff 대비 가치 낮음).
- **SDK 비공개 API 의존(bootstrapSocketConnection)** — SDK 측 작업이 필요해
  이번 범위에서 제외, 기존 "revisit" 표시 유지.

### 5. 착수 시점

**relay DM 로드맵(ADR-0033 계열) 트랙이 모두 완료된 후 착수한다.** 이 리팩토링은
app-runtime 중심부를 건드려 진행 중 트랙과 정면 충돌하기 때문이다.

## 대안 (Alternatives)

- **gateway 예외 유지 + 공식 예외 목록화** — 재검토 트리거(push 전환) 미발동
  상태라 유지가 자연스럽다는 안. 두 접근 표면의 공존 혼선이 더 크다고 판단해
  버림.
- **web-core 도메인 중복 읽기 즉시/점진 이관** — 소비처 100+ 파일로 이번 목적
  (구조 정리) 대비 범위 과대. 버림 (후속 재검토).
- **V2 접미사 전면 리네임** — 기계적 diff가 거대하고 병렬 브랜치 충돌 위험 대비
  가치가 낮다. 버림.
- **트랙과 병행하되 겹치는 파일 회피** — app-runtime 중심부(cid·순환·Host)가
  트랙 작업 파일과 정면으로 겹쳐 회피 실익이 없다. 버림.

## 결과 (Consequences)

- 얻는 것: UI의 데이터 접근 표면이 `useRuntimeRepositories` 하나로 수렴해 "언제
  어느 표면을 쓰나"의 혼선이 사라진다. cid 규칙 단일화로 cross-cloud 오염 방어가
  한 곳에 모이고, 순환 해소로 data/socket/runtime을 모듈 단위로 이해·테스트할 수
  있게 된다.
- 감수하는 것:
    - 영속화 없는 데이터에도 repository facade를 만든다 — "repository = 접근
      표면" 재정의를 문서(libs/data README 등)에 반영해야 한다.
    - 착수가 relay 트랙 완료에 묶여 있고, 그때까지 신규 위반 유입을 막는 자동
      장치는 없다 (코드 리뷰로 수동 방어).
    - web-core REST 이중 표면은 이번에 해소되지 않는다 — user/cloud 데이터의
      "REST 읽기 vs repository 읽기" 불일치 가능성은 잔존.
- 구현 분할은 [[dev-2_implement]] 스펙 단계에서 확정한다. 예상 트랙: (a) invite/
  auth repository 승격 + gateway 표면 제거, (b) cid 단일화 + 순환 해소 + 레이어
  역전, (c) profile 수렴 + 이중 관리 정리 + Host 통합, (d) 크로스-스코프 읽기 API.
