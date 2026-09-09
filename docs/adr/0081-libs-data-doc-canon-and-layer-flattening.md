# ADR-0081: libs/data 문서 정본을 분량으로 가르고, V2 접미사와 `src/data` 중첩을 걷어낸다

> 상태: Accepted · 결정일: 2026-09-09 · 관련: [ADR-0036](./0036-data-surface-unification-app-runtime-cleanup.md) (이름 규약 계승)

## 맥락 (Context)

리포 전체 문서 최신화 트랙의 첫 단계다. `libs/data`를 먼저 하는 이유는 하나다 — 여기서 정한
문서 규칙이 나머지 11개 문서 트리의 본이 된다.

### 문서가 없는 코드를 설명한다 (5건)

| 문서                          | 주장                                                                       | 실제                                                         |
| ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `docs/README.md`              | `### events (src/data/events)` 섹션 전체 (`DomainEventMap`, `eventBus.ts`) | 디렉토리 자체가 없다                                         |
| `docs/README.md`              | 트리에 `repositories/` — "공유 계약 보관"                                  | 없다. `DataContext`는 `repositories-v2/types.ts:18`로 옮겼다 |
| `README.md`                   | 위 두 가지를 그대로 반복                                                   | 같은 오류가 두 곳에 있다                                     |
| `docs/repositories/README.md` | 도메인 8개 (`channel, chat, cloud, join, place, profile, user, syncMeta`)  | 13개다. `auth·device·invite·report·subscription`이 빠졌다    |
| `docs/repositories/README.md` | "`src/data/repositories`는 `DataContext`만 보관"                           | 없다                                                         |

`docs/remote/README.md`는 정확했다 (Socket 11종 · Http 5종이 실제와 맞는다).

### 문서 분량의 66%가 작업 로그다

`docs/http-data-path.md`가 614줄 · 45KB다. 섹션 제목이 성격을 그대로 드러낸다 — "3단계 예고",
"검증 방법", "구현 중 문서에서 벗어난 지점", "실측이 문서 예측과 정확히 일치한 것". 참조 문서가
아니라 완료된 트랙의 작업 기록이다.

### 정본이 둘이다

`README.md` 242줄과 `docs/README.md` 63줄이 도입부를 거의 그대로 중복한다 — 핵심 원칙 3줄,
socket lifecycle 문단. 위의 오류 2건도 양쪽에 함께 있다.

### 문서를 읽다 코드 문제가 드러났다

"V1은 제거됐다"는 주석이 README 3곳에 있다. V1이 없는데 `V2` 접미사가 **119파일**에 남아 있다.
그리고 경계에서 별칭을 강제한다.

```ts
// libs/app-runtime/src/data/factories/localFactory.ts:5
createLocalDataSourcesV2 as createDataLocalDataSources,
```

`libs/app-runtime`은 이미 V2 없는 이름을 쓴다 — `createRepositories`, `createLocalDataSources`.
**`libs/data`만 V2를 말하고 나머지는 안 말하는 상태**다.

### 파급 실측

- **배럴 우회 0건.** `@chatic/data` 소비 파일 213개가 전부 배럴만 쓴다. `@chatic/data/...` 내부 경로 import는 없다.
- 따라서 `src/data/**` 재배치는 **외부 파급 0**이고 내부 109파일만 바뀐다.
- `V2` 식별자 제거는 배럴로 나가므로 **외부 119파일**이 바뀐다.
- 안전망: `libs/data` 테스트 45파일 · 348케이스.

### 리포 전체 배치가 4갈래다

| 패턴                             | 해당 모듈                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| README + `docs/` 둘 다 큼 (중복) | `data` (242줄 + 8), `app-runtime` (132줄 + 24)                                                  |
| `docs/`만                        | `auth-sign`, `http`, `logger`, `apps/web`(55), `admin-v2`, `testbed`, `mobile`                  |
| README만                         | `app-messages`(202줄), `bridges`(271줄), `db`, `web-ui-kit`                                     |
| 아무것도 없음                    | `block-kit`, `i18n-mobile`, `policy-content`, `web-config`, `desktop-web`, `desktop`, `landing` |

`device-utils`·`shared`·`theme`의 README는 nx 스캐폴드 3줄 그대로다 —
`This library was generated with Nx`.

## 결정 (Decision)

### 1. 문서 정본은 분량으로 가른다 (리포 전체 규칙)

- **정본은 하나다.** `README.md`와 `docs/`가 같은 사실을 말하면 하나를 진입점으로 강등한다.
- **정본 위치는 이미 정해진 것을 존중한다.** `docs/`가 있으면 `docs/`, 없으면 `README.md`.
- **`docs/`를 새로 만드는 기준**만 문서 3개 초과다.
- 같은 사실은 정본 한 곳에만 쓰고 나머지는 링크한다.
- `docs/`가 정본인 모듈의 `README.md`는 20줄 이내 진입점만 둔다 — 무엇인지 한 문단과 `docs/` 링크.

`libs/data`는 문서 8개이고 정본이 둘이다. `docs/`가 정본이고 `README.md`를 20줄 진입점으로 줄인다.

> **2026-09-09 보정.** 처음에는 "문서 3개 이하면 `README.md` 하나"로 적었다. 그 규칙은
> `libs/http`·`libs/db`·`libs/auth-sign`·`libs/logger`를 오탐으로 잡는다 — 네 곳 모두 문서가
> 1~2개지만 이미 `docs/architecture.md`가 정본이고, 60개 문서가 쓰는 컨벤션과 ADR-0070 상호
> 링크를 재직해야 얻는 게 없다. 규칙의 진짜 대상은 정본이 **둘인** 곳(`data`, `app-runtime`)이었다.

이 기준이면 손대지 않는 곳이 분명해진다 — `bridges`(271줄)·`app-messages`(202줄)는 `README.md`가
유일한 정본이고, `http`·`db`·`auth-sign`·`logger`는 `docs/`가 유일한 정본이다.

### 2. 삭제 대상은 4범주다

1. **작업로그·계획·예고·검증절차** — 코드로 검증할 수 없는 시제. 결정 기록으로 남길 값은 `docs/adr/`이 이미 맡는다.
2. **중복** — 같은 사실이 두 곳에 있으면 정본만 남기고 링크로 바꾼다.
3. **없는 코드를 설명하는 섹션** — 갱신할 대상이 없으니 통째로 삭제한다.
4. **nx 스캐폴드 README** — `device-utils`·`shared`·`theme` 3건.

`docs/http-data-path.md`는 1번에 해당한다. 살아있는 사실만 `docs/remote.md`로 흡수하고
원본을 삭제한다. 흡수 대상은 세 가지다 — gateway 매핑 표, HttpDataSource 5종의 도메인 매핑·캐시 의미,
`ReportHttpDataSource`가 도메인 없이 이 층을 지나는 이유.

### 3. `src/data` 중첩을 한 단계 걷어낸다

```text
# 지금                              # 이후
libs/data/src/                      libs/data/src/
├── index.ts                        ├── index.ts
└── data/                           ├── domain/
    ├── domain/                     ├── local/
    ├── local/                      │   ├── data-sources/
    │   ├── data-sources-v2/        │   ├── ports/
    │   ├── ports/                  │   └── stableHash.ts
    │   └── stableHash.ts           ├── remote/
    ├── remote/                     │   ├── gateways/
    │   ├── gateways/               │   ├── socket-data-sources/
    │   ├── socket-data-sources/    │   └── http-data-sources/
    │   └── http-data-sources/      └── repositories/
    └── repositories-v2/
```

레이어 경계는 그대로 둔다. 도메인 수직 슬라이싱은 하지 않는다. 이 모양이 문서 폴더
`docs/{local,remote,repositories}/`와 1:1로 맞고, 문서 폴더명이 코드 경로와 어긋난 문제도 함께 사라진다.

### 4. `V2` 접미사를 제거한다

| 지금                                               | 이후                                           |
| -------------------------------------------------- | ---------------------------------------------- |
| `repositories-v2/`                                 | `repositories/`                                |
| `local/data-sources-v2/`                           | `local/data-sources/`                          |
| `XxxRepositoryV2` · `IXxxRepositoryV2`             | `XxxRepository` · `IXxxRepository`             |
| `BaseRepositoryV2`                                 | `BaseRepository`                               |
| `createRepositoriesV2`                             | `createRepositories`                           |
| `DataRepositoriesV2` · `DataRepositoriesV2Options` | `DataRepositories` · `DataRepositoriesOptions` |
| `XxxLocalDataSourceV2` · `IXxxLocalDataSourceV2`   | `XxxLocalDataSource` · `IXxxLocalDataSource`   |
| `LocalDataSourcesV2`                               | `LocalDataSources`                             |
| `createLocalDataSourcesV2`                         | `createLocalDataSources`                       |

데이터 레이어와 무관한 `V2`는 건드리지 않는다 — `apps/admin-v2` 경로, `useRegisterUserV2`,
`useChatOutbox`·`useCloudCatalog` 등의 지역 식별자. 전역 치환이 아니라 위 표의 이름만 옮긴다.

`Invite` 도메인이 함정이다. `I` 접두 인터페이스와 도메인 이름이 겹쳐서
`IInviteRepositoryV2`와 `InviteRepositoryV2`가 나란히 있다. 정규식으로 `I` 접두를 다루면 이 둘이
섞인다. 도메인 이름을 명시한 치환만 쓴다.

### 5. `app-runtime`의 `repositoryFactory`를 삭제한다

`V2`를 떼면 `libs/data`의 `createRepositories`와 `app-runtime`의 래퍼 이름이 겹친다.
`factories/repositoryFactory.ts`는 `context` ↔ `contextProvider` 키만 바꿔주는 30줄 껍데기다.
삭제하고 `DataManager`가 `@chatic/data`의 `createRepositories`를 직접 부른다.

`factories/localFactory.ts`는 남긴다. 스토리지 라우팅과 fingerprint 로직이 있어서 성격이 다르다.
import 별칭만 없앤다.

### 순서와 검증

1. **평탄화** — 외부 파급 0. libs/data 내부에서 닫힌다.
2. **`V2` 제거 + `repositoryFactory` 삭제** — 리포 전체로 번진다.
3. **문서 재작성** — 위 두 단계의 결과를 기술한다.

파급이 0인 쪽을 먼저 해야 `V2` 제거의 diff가 읽힌다. 단계마다
`npx tsc -b libs/data/tsconfig.lib.json`과 jest를 돌린다. 워크트리에 `node_modules`가 없으므로
메인 체크아웃에서 심링크를 붙이고 끝나면 제거한다. 커밋은 단계별로 3개다.

### 범위에서 제외

- 도메인 수직 슬라이싱
- 배럴 명시화 — `index.ts`의 `export *` 8줄을 유지한다
- ADR 번호 충돌 (0027×3, 0033×3, 0034×4, 0045×3, 0047×4, 0075×2)과 빠진 번호 (0038, 0061, 0064, 0065, 0069)
- 루트 `docs/` 중복 트리 — `spec/` vs `specs/`, `frontend-handover.md` vs 동명 폴더, `DEEP-LINKING.md` vs `-V2.md`
- `libs/data` 밖 11개 문서 트리 — 규칙만 여기서 정하고 적용은 다음 단계다

## 대안 (Alternatives)

**문서만 고치고 `V2`는 둔다.** 버렸다. "V1은 제거됐다"는 주석 3개가 계속 남는다. 문서가 V2의 뜻을
설명하는 데 지면을 쓴다. 원인이 코드에 있는데 문서로 덮는 셈이다.

**도메인 수직 슬라이싱** (`src/domains/chat/{ChatRepository, ChatLocalDataSource, ChatSocketDataSource}.ts`).
버렸다. 축이 비대칭이다 — repository 13개, socket DS 11개, local DS 9개, http DS 5개. 13개 폴더
모양이 들쭉날쭉해지고, "읽기는 local · remote는 command" 원칙이 디렉토리에서 사라진다.

**모든 모듈에 `docs/` 정본을 강제한다.** 버렸다. `bridges` 271줄과 `app-messages` 202줄까지 분해해야
해서 트랙이 비대해진다. 분량 기준이면 그 둘은 지금 모양이 맞다.

**모듈당 `README.md` 하나로 통산한다.** 버렸다. `apps/web` 문서 55개나 `libs/data` 4개 레이어를
한 파일에 넣을 수 없다.

**`http-data-path.md`를 `docs/adr/`로 이관한다.** 버렸다. 같은 결정은 ADR-0036이 이미 담고 있다.
작업 로그가 ADR 폴더를 늘릴 이유가 없다.

**`V2` 제거를 먼저 하고 평탄화를 나중에.** 버렸다. 두 변경이 한 diff에 섞인다. 파급 0인 쪽이 먼저다.

## 결과 (Consequences)

### 얻는 것

- 문서 5건의 거짓이 사라지고 정본이 하나가 된다.
- `libs/data` 문서 분량이 크게 줄어든다 — `http-data-path.md` 614줄과 README 중복분.
- 경계에서 별칭이 사라진다. `app-runtime`과 `libs/data`가 같은 이름을 말한다.
- 나머지 11개 트리에 적용할 규칙이 생긴다. 재인터뷰 없이 이어갈 수 있다.

### 감수하는 것

- **커밋 3개가 109~213파일을 건드린다.** 리베이스 충돌 표면이 크다. 이 워크트리는 다른 세션과 git 인덱스를 공유하니 커밋할 때 경로를 명시해 스테이징한다.
- **의미 충돌은 타입체크만 잡는다.** 순수 리네임이라 리베이스 후 재검증이 필수다.
- **nx의 낡은 `dist`/`out-tsc`가 유령 에러를 만든다.** 디렉토리를 물리 이동하면 다운스트림 typecheck가 옛 심볼을 본다. 진단 전에 `rm -rf`로 강제 삭제한다.
- **`desktop-web`은 push로만 배포되고 되돌릴 수단이 없다.** 이 트랙이 건드리는 `desktop-web` 파일은 리네임에 한정한다.
- **옛 이름으로 쓰인 ADR은 그대로 둔다.** 2026-09-01 리네임 때와 같은 방식이다 — `libs/data/docs/remote.md`의 대응표에 `V2` 제거 행을 덧붙이고, 과거 ADR 본문은 기록이므로 손대지 않는다.

## 다음 단계

`dev-2_implement`의 스펙 작성(Phase A)으로 넘긴다.

리포 전체 트랙의 이후 순서 후보:

1. `libs/app-runtime` — 문서 24개, 두 번째로 크고 README 중복도 같은 모양이다
2. `apps/web` — 문서 55개, 가장 크다
3. 루트 `docs/` 중복 트리 3건 병합 — **처음부터 하지 않는다.** 2026-08-20에 같은 작업을 끝냈지만 워크트리가 사라져 유실됐다 (어느 브랜치에도 안 남았다). 판정 결과가 `~/.claude/plans/docs-partitioned-seahorse.md`에 살아 있으니 그것부터 읽는다 — spec 18개의 이전·폐기 판정과 당시 발견한 버그 2건(admin 딥링크 구형 형식, Firestore 지연 딥링크 death)이 들어 있다.
4. ADR 번호 충돌 정리

유실 사고의 교훈은 이 트랙에 이미 반영했다 — 단계마다 커밋한다. 워크트리를 끝까지 안 비운다.
