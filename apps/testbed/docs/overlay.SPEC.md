# [기술 스펙 명세서] 전역 오버레이

## 1. 목적

오버레이는 어느 화면에서든 열 수 있는 전역 진단 패널이다.

이 패널의 역할은 다음에 한정한다.

- 현재 세션 상태 조회
- 현재 웹 런타임 상태 조회
- 현재 DB 상태 조회
- 현재 소켓 상태 조회
- 현재 페이지를 벗어나지 않고 상태를 빠르게 확인

로그인 수행 자체는 오버레이가 아니라 별도 로그인 페이지에서 처리한다.

## 2. 오버레이 열기/닫기 규칙

- 채팅 홈, 채널 상세, 설정 페이지 어디서든 동일한 진입점으로 연다
- 오버레이를 닫아도 현재 라우트와 선택 상태는 유지한다
- 모바일 기준에서는 바텀 시트 또는 풀스크린 다이얼로그 형태를 우선 고려한다
- 데스크톱에서는 우측 패널 또는 모달 형태를 허용한다

## 3. 표시 영역

### 3.1 Session Status

표시 항목:

- relay 로그인 여부
- 현재 활성 cloud id
- 현재 활성 place id
- 현재 활성 channel id
- relay session 존재 여부
- cloud session 존재 여부
- invited cloud 보유 현황

의도:

- 현재 사용자가 relay 상태인지 cloud 상태인지 즉시 식별할 수 있어야 한다
- 클라우드 전환 직후 상태 정합성을 빠르게 확인할 수 있어야 한다

### 3.2 Web Runtime Status

표시 항목:

- 현재 backend 주소
- 현재 wss 주소
- 현재 active server 요약
- 인증 상태
- 최근 세션 전이 시각

의도:

- 어떤 서버 대상으로 동작 중인지 즉시 파악할 수 있어야 한다
- guest login, cloud switch, logout 이후 런타임 기준점이 바뀌었는지 확인할 수 있어야 한다

### 3.3 DB Browser

DB Browser는 `ChaticWebCacheDB`(IndexedDB)의 `cache_store` 테이블을
오버레이에서 직접 조회·삭제할 수 있는 진단 패널이다.

#### 3.3.1 테이블 목록 패널

표시 항목:

- `CacheType` 7종 각각의 이름과 전체 row count
    - `channel`, `chat`, `user`, `join`, `site`, `invitecloud`, `profile`
- 각 타입의 현재 partition 기준 (`cid` / `uid`)
- 선택 시 해당 타입의 쿼리 패널로 진입

의도:

- 캐싱 스트림이 실제 저장소에 반영되고 있는지 확인한다
- 다른 cloud/place 데이터가 혼입되는지 빠르게 파악한다

#### 3.3.2 쿼리 패널

테이블 선택 후 아래 흐름으로 동작한다.

쿼리 입력:

- 타입별 추가 필터 (각 repository의 `cacheReadList(query)` query 파라미터 기준):
    - `channel`: `sid` (사이트 필터), `keyword`
    - `chat`: `channelId`, `sort` (asc/desc), `limit`, `cursorNo`, `keyword`
    - `site`: `keyword`
    - `join`: `channelId`, `userId`
    - `profile`: `sid`
    - `user`, `inviteCloud`: 추가 필터 없음

쿼리 실행:

- `repositories.<type>.cacheReadList(query)` 호출
- `useRuntimeRepositories()` hook으로 repositories 접근
- 결과는 쿼리 결과 패널에 표시
- 실행 중 로딩 표시, 오류 시 오류 메시지 표시

현재 코드 근거:

- `libs/app-runtime/src/runtime/useRuntimeRepositories.ts` — repositories hook
- `libs/data/src/data/repositories-v2/index.ts` — `DataRepositoriesV2` 인터페이스
- `libs/app-messages/src/types/model/cache.ts` — `CacheQueryMap` 쿼리 옵션 정의

#### 3.3.3 쿼리 결과 패널

표시 형태:

- row count (조회된 건수)
- 각 row를 JSON 형태로 collapse/expand 가능한 아이템으로 표시
- 주요 식별자 (`id`, `cid`, `uid`, `channelId` 등)는 상단에 고정 노출

행 단위 액션:

- **Delete**: 해당 row의 `id`로 `repositories.<type>.cacheDelete(id)` 호출

#### 3.3.4 테이블 단위 액션

- **Clear All**: `repositories.<type>.cacheClear()` 호출 — 현재 context(cid/uid) 기준 해당 타입 전체 삭제
    - 파괴적 동작이므로 확인 다이얼로그를 반드시 거친다
- **Refresh**: `cacheReadList`를 재실행하여 결과를 갱신한다

#### 3.3.5 구현 접근 방식

- DB 데이터 접근은 반드시 `useRuntimeRepositories()` hook을 통해 얻은 `DataRepositoriesV2`를 사용한다
- 직접 IndexedDB API 호출 및 `CacheStorage<T>` 직접 접근을 금지한다
- 쿼리 결과는 오버레이 내 로컬 상태로만 관리하며 전역 스토어에 반영하지 않는다

repositories 타입-키 대응:

| CacheType     | repositories 키 |
| ------------- | --------------- |
| `channel`     | `.channel`      |
| `chat`        | `.chat`         |
| `site`        | `.site`         |
| `user`        | `.user`         |
| `join`        | `.join`         |
| `invitecloud` | `.inviteCloud`  |
| `profile`     | `.profile`      |

### 3.4 Socket Status

표시 항목:

- 소켓 연결 상태
- 현재 연결 대상 cloud id
- verified 여부
- 최근 reconnect 시각
- 최근 에러 요약

의도:

- cloud 전환과 로그아웃 이후 소켓이 기대 상태로 복구되었는지 확인한다

## 4. 허용 액션

오버레이는 기본적으로 조회 중심이지만, 아래의 비파괴 액션은 허용한다.

- reconnect
- runtime re-init
- cache refresh
- DB 쿼리 실행 (loadAll with options)
- DB 행 단위 삭제 (delete by id)
- DB 테이블 단위 전체 삭제 (clearAll — 확인 다이얼로그 필수)

아래 액션은 설정 페이지를 통해 제공한다.

- 로그인 페이지 이동
- cloud 로그아웃
- relay 로그아웃

## 5. 상태 갱신 규칙

- 오버레이에 표시되는 정보는 가능한 한 읽기 전용 스냅샷이 아니라 실시간 상태를 반영해야 한다
- 소켓 상태와 세션 상태는 동일한 기준 store 또는 hook 계층에서 읽어야 한다
- DB 상태는 고비용 조회를 반복하지 않도록 요약값을 우선 노출한다

## 6. 검증 포인트

- 채팅 홈에서 cloud 전환 후 오버레이의 session/web/socket 상태가 함께 바뀌어야 한다
- relay 로그아웃 후 cloud 관련 상태가 모두 비워져야 한다
- reconnect 이후 소켓 상태와 backend/wss 정보가 일관되게 유지되어야 한다
- DB Browser에서 7개 CacheType 각각의 row count가 표시되어야 한다
- 쿼리 필터(cid/uid 및 타입별 옵션)를 변경하면 결과가 갱신되어야 한다
- 행 단위 Delete 이후 해당 row가 결과 목록에서 즉시 사라져야 한다
- Clear All 실행 후 해당 타입의 row count가 0이 되어야 한다
- DB 조작 결과가 전역 스토어나 채팅 화면 상태에 영향을 주지 않아야 한다
