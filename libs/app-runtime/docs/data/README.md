# Data Domain Spec

## 목적

`data` 도메인은 repository, local data source, remote data source를 조립해 앱이 사용할 headless data runtime을 제공한다.

이 문서에서 중요한 점은 `data`가 소켓 lifecycle을 소유하지 않는다는 것이다.

## 조립 구조

```mermaid
flowchart TD
  SocketManager["SocketManager"] --> Gateways["Remote API Gateways"]
  Gateways --> Remote["Remote Data Sources"]
  Context["DataContext"] --> Local["Local Data Sources"]
  Remote --> Repo["Repositories"]
  Local --> Repo
```

## 책임

### `DataManager`

- data context 생명주기 관리 — `DataContextHolder`에 현재 `{ cid, sid?, uid? }` 보관
- `ensure(context)`로 context 갱신 후 repository 반환
- `destroy()`로 context를 `DEFAULT_CONTEXT`로 리셋 (**캐시는 비우지 않는다**)
- **`socketAwareProvider`** — context holder를 감싸 `getContext()`마다 live `socketCid = getSocketManager().getBoundCid()`를 주입한다. repository가 socket이 붙은 클라우드와 캐시 컨텍스트 클라우드의 **불일치를 감지해 오염 쓰기를 스킵**하도록 한다(cross-cloud 가드).

### `remoteFactory`

- socket 기반 gateway 조립
- remote data source 조립
- repository가 사용할 remote interface 제공

### repository

- local/remote 결과 해석
- cache merge/remove
- observe stream 제공

## 비책임

`data`는 아래를 직접 처리하지 않는다.

- token refresh
- 401 recovery orchestration
- socket reconnect policy
- sync runtime 생성/정지

## socket 의존 규칙

- `remoteFactory`는 raw client에 직접 의존하지 않는다.
- `remoteFactory`는 `SocketManager`의 stable socket API를 사용한다.

이 규칙의 목적:

- socket 교체가 data 조립 로직으로 새지 않게 하기 위함
- retry/rebind 책임을 data가 떠안지 않게 하기 위함

## sync와의 경계

- sync plan의 lifecycle은 `SyncManager`가 소유한다.
- sync plan callback 결과를 local cache에 반영하는 것은 repository가 소유한다.

정리:

- `SyncManager` = 언제 sync할지
- `repository` = sync 결과를 어떻게 반영할지

## 런타임 반응 시나리오

### cloud/site 전환

- `RuntimeDataBinder`가 `DataManager.ensure(context)`를 호출한다.
- repository는 새 scope 기준 캐시를 읽는다.
- socket/session 계층의 재인증은 별도 책임이다.

### logout

- 외부 세션 레이어가 필요 시 `DataManager.destroy()`를 호출한다.
- data는 자기 리소스만 정리한다.
- socket/session 상태를 직접 제어하지 않는다.

## 저장소 선택과 web↔app 배포 스큐

`resolveCacheBackend(type)`(`cacheStorageRouting.ts`)가 도메인별 저장소를 고른다 — 라우팅
결정의 단일 지점이며, `getCacheStorage`(`factories/localFactory.ts`)는 그 결과를 어댑터로
실체화만 한다. 전체 설계는 [cache-storage-routing.md](cache-storage-routing.md) 참고. 판정은 셋뿐이다.

1. 브라우저(네이티브 브리지 없음) → 항상 web(IndexedDB).
2. `WEB_PINNED_CACHE_TYPES`에 고정된 타입 → web(IndexedDB). 현재 비어 있다.
3. **네이티브가 못 다루는 도메인** → web(IndexedDB). 그 외 → native(NativeDB/SQLite).

3번이 배포 스큐 대응이다. 웹은 앱보다 먼저 배포되므로 **웹이 아는 CacheType이
설치된 앱이 아는 것보다 많을 수 있다**. 그런 타입을 그냥 보내면 네이티브 `CacheCrudService`의
`default:` 분기가 `success: true` + `null`로 답한다 — 에러가 아니라 **영원히 빈 캐시**로 보인다.

판정은 **도메인별 계약 판번호**로 한다(ADR-0053): 앱은 자신이 **구현한** 판을 핸드셰이크로 보고하고,
웹은 자신이 **요구하는** 판을 선언해 도메인마다 비교한다. 앱 보고는 실제 도달한 DB 상태에서 도출하고,
서버 목록 API가 없어 캐시가 곧 권위인 도메인(`invitecloud`)은 아예 게이트 대상에서 뺀다. 판번호 체계,
보고 형식, 새 도메인·새 판 추가 절차는 **[cache-contract-versions.md](cache-contract-versions.md)가
소유한다** — 이 절은 라우팅에서 그 판정이 어디에 끼는지만 가리킨다.

## 관련 문서

- [cache-storage-routing.md](cache-storage-routing.md) — 캐시 저장소 라우팅 설계 (ADR-0051)
- [cache-contract-versions.md](cache-contract-versions.md) — 도메인별 캐시 계약 판번호 협상 (ADR-0053) — 위 3번 판정의 소유 문서
- [invite-local-cache.md](invite-local-cache.md) — 초대 목록 로컬 캐시·자격증명 분리 (ADR-0052) — `invite` CacheType이 스큐 게이트를 실제로 처음 통과한 사례
- [invite-cloud-durability.md](invite-cloud-durability.md) — 초대클라우드 푸시 복구·이름 동기화
- [context-design.md](context-design.md) — 전역/요청 context 분리 설계
- [../architecture.md](../architecture.md) — 전체 아키텍처·소유 규칙
- [../sync/README.md](../socket/sync/README.md) — sync 결과의 cache 반영 경계
