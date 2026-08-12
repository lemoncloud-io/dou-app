# ADR-0030: app-runtime cold DB 전환, hot→cold 시딩, 초대클라우드 복구

> 상태: Superseded (2-tier 관련 결정 한정) → [ADR-0051](0051-cache-storage-routing-simplification.md) · 결정일: 2026-07-24

> **아래 본문은 2026-07-24 시점의 기록이며 수정하지 않는다.** 이후 무엇이 바뀌었는지는 다음과 같다.
>
> - **결정 1(cold DB 활성화)의 수단이 뒤집혔다.** `HotColdCacheStorageStrategy`로 hot/cold 2-tier를
>   켜기로 했으나, 3일 뒤 커밋 `796aa3cf`(2026-07-27)가 네이티브를 **cold 단일 계층**으로 바꿨다 —
>   2-tier의 cold-first 쓰기 게이트와 cold 미스→hot 폴백 부재가 채널·채팅 로드 실패로 드러났기
>   때문이다. 그 전환에는 ADR이 남지 않았고, [ADR-0051](0051-cache-storage-routing-simplification.md)이
>   그 현실을 기록하며 죽은 2-tier 기계를 삭제했다. **"cold(SQLite)를 네이티브의 진실원본으로 쓴다"는
>   목적 자체는 그대로 유효하다.**
> - **결정 3의 "hot 유실 자가복구" 근거는 더 이상 성립하지 않는다.** `DynamicCacheStorage`의
>   hot 미스→cold 폴백→hot 재백필 기계는 삭제됐다. 다만 네이티브에서 초대클라우드는 이제 cold에만
>   저장되므로 "hot에서 사라짐"이라는 실패 모드 자체가 없어졌고, 결론(캐시 DB 단일 원천, durable cold)은
>   유지된다.
> - **결정 2(invitecloud hot→cold 일회 시딩)는 그대로 살아 있다.** 지금은 web→native 어휘로
>   이름이 바뀌어 `createWebInviteCloudStorage`와 `invitedCloudDurability`가 그 역할을 한다
>   (완료 플래그의 localStorage 키는 재실행을 막기 위해 옛 이름 그대로 동결).
>
> 현재 저장소 라우팅의 실제 동작: [cache-storage-routing.md](../../libs/app-runtime/docs/data/cache-storage-routing.md)

## 맥락 (Context)

`libs/app-runtime`는 hot/cold 2-tier 캐시 기계(`DynamicCacheStorage`: cold=진실원본, hot=파생캐시)를
이미 완성·테스트해 두었으나, `factories/localFactory.ts`의 `selectStrategy()`가 모든 환경에서
`IndexedDbOnlyCacheStorageStrategy`를 하드리턴하고 있어 cold(native SQLite) 계층이 휴면 상태다.
TODO 주석은 "native caching domains가 브릿지에 등록되기 전까지 Hot+Cold 비활성"이라 명시한다.
모바일 쪽(cold)은 이미 준비돼 있다: `dou.sqlite`(마이그레이션 v9), `useCrudCacheHandler`,
도메인별 `*DataSource`, 브릿지 메시지 핸들러가 모두 연결돼 있다.

이제 cold DB를 실제로 켜려 하는데 세 가지 요구가 얽혀 있다.

1. **cold DB 활성화** — app-runtime이 네이티브에서 cold(SQLite)를 사용하도록 전환.
2. **기존 배포 캐시 동기화** — 이미 배포된 유저의 캐싱 데이터는 전부 hot(IndexedDB)에만 있고,
   cold(SQLite)는 텅 비어 있다. cold가 진실원본이 되는데 cold-first 읽기 경로(`join`, 커서 기반 `chat`)는
   역방향 백필이 없어, 전환 직후 읽음 상태(readNo)·안읽음 카운트·히스토리가 파손될 수 있다.
3. **초대클라우드 복구** — 초대클라우드(`cloudType: 'invited'`)는 어떤 sync/list API에도 없는 로컬 전용
   엔티티다. invite-accept 시점에만 로컬 캐시로 write되며, 서버에 열거 API가 없다. 실제로 "hot 캐시에서
   초대클라우드가 가끔 사라지는" 문제가 관측되고, 그 시점에 푸시가 도착하기도 한다. 백엔드 변경은
   이번 범위에서 불가하다(프론트 전용).

관련 조사 결과(요약):

- 쓰기는 cold-first 후 hot fire-and-forget. 읽기는 hot-first(단 `join`은 cold-first, 커서 `loadAll`도 강제 cold-first).
  hot 미스 시 cold 폴백 후 hot 재백필은 존재하나, **역방향(cold 미스→hot 폴백)은 없다.**
- 초대클라우드의 `id/name/backend/wss`의 유일한 write 지점은 invite-accept의 `cloud.cacheWrite`(캐시 DB)뿐이며,
  캐시가 비면 사라진다.
- 푸시 페이로드에는 `backend`/`wss`가 없고 `cid`도 배포 백엔드에선 대개 빈 문자열이다.
- 그러나 `issueCloudDelegationToken(cloudId)`(릴레이, 기존 엔드포인트)는 `cloudId`만 있으면
  그 클라우드의 `backend`/`wss`/`cid`를 재발급해 준다 — 백엔드 변경 없이 프론트에서 호출 가능.
- `localStorage`는 캐시 DB와 완전히 별개 저장소로 캐시 클리어 시에도 살아남는다.
  `chatic-invited-clouds`(`CLOUD_INVITED_BUNDLES_KEY`) 키는 정의돼 있으나 지우기만 할 뿐 writer가 없는 죽은 키다.

## 결정 (Decision)

**대상 플랫폼: 모바일(native WebView)만.** cold DB는 네이티브 브릿지가 있는 모바일에만 존재하므로
웹/데스크톱-웹은 `IndexedDbOnlyCacheStorageStrategy`를 그대로 유지한다. hot/cold 2-tier 구조는 설계대로 유지한다
(hot=파생캐시, cold=진실원본).

### 1. cold DB 활성화

`selectStrategy()`가 네이티브 환경(`isNativeApp()`)에서 `HotColdCacheStorageStrategy`를 반환하도록 전환한다.
네이티브 캐싱 도메인은 이미 브릿지에 등록돼 있으므로 TODO의 선행조건은 충족된 상태다.

### 2. hot→cold 시딩 (마이그레이션)

**첫 부팅에 `invitecloud` 타입만 hot(IndexedDB)→cold(SQLite)로 일회 시딩한다.** localStorage에 완료 플래그를
찍어 재실행을 방지한다. 나머지 타입(channel/user/join/site/profile/meta/chat)은 **시딩하지 않는다** —
서버 재수화 + cold-first 쓰기로 정상 사용 중 자연히 cold가 채워지기 때문이다. 초대클라우드만이 서버에
다시 요청할 데가 없는 로컬 전용 데이터라 유일하게 명시적 이관이 필요하다.

- 전환 직후 cold-first 읽기(`join` readNo, 커서 `chat`)는 서버 재싱크로 복원되며, 그 사이 잠깐의 안읽음
  카운트/히스토리 공백은 감수한다.

### 3. 초대클라우드 복구 (프론트 전용, 캐시 DB 단일 원천)

**캐시 DB(cold+hot)를 초대클라우드의 유일한 원천으로 둔다.** 캐시 DB와 병행하는 별도 durable 저장소(localStorage
레지스트리 등)는 두지 않는다 — 두 원천은 divergence로 데이터가 꼬일 수 있어 의도적으로 배제한다.

- **hot 유실 자가복구**: cold가 hot을 잃는 통상 케이스는 별도 코드 없이 `DynamicCacheStorage`의 hot 미스→cold
  폴백→hot 재백필로 자가복구된다. 초대클라우드를 durable한 cold에 두는 것 자체가 "hot에서 사라짐"의 근본 해결이다.
- **푸시 안전망(best-effort)**: 푸시의 `cid`가 유효하면(중첩 `payload`까지 파싱) 캐시에 없는 경우
  `issueCloudDelegationToken(cid)`로 엔드포인트를 재구성한다.
- **이름 동기화**: 초대클라우드 소켓이 verified되면 `cloud.get`으로 권위있는 이름을 받아 갱신한다(delegation
  토큰엔 이름이 없음).

**범위 제외(후속 과제):** cold·hot 둘 다 비워진 완전 초기화(앱 재설치·캐시 전체 삭제) + 푸시 `cid`도 없는 경우는
어느 클라우드인지 특정할 수 없어 프론트만으론 복구 불가. 별도 durable 저장소를 두지 않기로 한 결과다. 이는 푸시
페이로드에 `cid`(또는 `backend`/`wss`) 탑재, 혹은 초대클라우드 열거 API(`GET /clouds/0/list?view=invited`) 신설
등 백엔드 지원이 있어야 한다.

## 대안 (Alternatives)

- **전체 타입 일괄 시딩** — 8개 타입 전부를 첫 부팅에 브릿지로 복사. cold가 즉시 완전한 진실원본이 되지만
  `chat`(사실상 영구 TTL)이 대량인 유저는 첫 부팅이 크게 느려진다. 초대클라우드 외에는 서버 재수화로
  대체 가능하므로 채택하지 않음.
- **지연 역방향 백필** — `DynamicCacheStorage`에 "cold 미스→hot 폴백→cold 백필" 경로를 추가. 부팅 비용 0,
  join/chat 자연 복구로 우아하나 "cold=진실원본" 불변식에 예외를 추가하게 되어 채택하지 않음. 대신 서버
  재싱크에 맡긴다.
- **서버 재싱크로 cold 채우기(hot 무시)** — 가장 단순하나 초대클라우드는 서버 출처가 없어 이 방식으론
  영영 복구 불가. 마이그레이션 대상에서 초대클라우드를 제외할 수 없는 이유.
- **localStorage 초대클라우드 레지스트리(별도 durable 저장소)** — 캐시 DB와 별개로 초대클라우드 id를 영구
  보관해 완전 초기화 시에도 부팅 복구가 되도록 하는 안. 처음엔 채택했으나, 캐시 DB와 병행하는 **두 번째 원천**이
  divergence로 데이터를 꼬이게 할 수 있어 **철회**했다(단일 원천 원칙). 완전 초기화 복구는 백엔드 후속으로 넘긴다.
- **백엔드 변경(푸시에 backend/wss 탑재 또는 view=invited API)** — 완전 소실까지 깔끔히 해결하나
  이번 범위에서 백엔드 불가라 후속 과제로만 기록.

## 결과 (Consequences)

**얻는 것**

- 모바일에서 cold(SQLite)가 진실원본으로 동작, hot(IndexedDB)은 파생 캐시로 자가복구.
- "hot 캐시에서 초대클라우드가 사라지는" 관측 문제가 cold durable 보관 + hot 미스→cold 폴백으로 해소.
- 푸시 `cid`가 유효하면 릴레이 재발급으로 초대클라우드 복구 가능. 이름은 접속 시 `cloud.get`으로 채워짐.
- 마이그레이션 부담 최소화 — 첫 부팅에 초대클라우드 소수 행만 복사.
- 초대클라우드의 원천이 캐시 DB 하나뿐이라 divergence 걱정이 없다(단일 원천).

**감수하는 트레이드오프 / 리스크**

- 전환 직후 첫 서버 재싱크 전까지 cold-first 경로(`join` readNo, 커서 `chat`)에 잠깐의 공백/부정확 가능.
- 완전 초기화(cold·hot 둘 다 소실) + 빈 푸시 cid는 프론트 복구 불가 — 백엔드 후속 과제 의존(단일 원천 선택의 대가).
- 웹/데스크톱-웹은 IndexedDB-only로 남아, 플랫폼별 캐시 전략 분기가 코드에 상존한다.
