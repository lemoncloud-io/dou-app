# [기술 스펙 명세서] 채팅 홈 페이지

## 1. 목적

채팅 홈 페이지는 사용자가 현재 접근 가능한 cloud, place, channel 범위를 탐색하고
채널 상세 화면으로 진입하는 메인 페이지다.

기존 `data` 검증 페이지처럼 단순히 목록을 나열하는 화면이 아니라,
실제 앱 진입 흐름에 가까운 전환 규칙을 검증하는 것이 목적이다.

## 2. 초기 진입 규칙

- 앱이 시작되면 기본적으로 guest login 유지 로직이 선행된다
- 채팅 홈 페이지에 처음 진입하면 place 목록이 먼저 노출된다
- 채널 목록은 현재 활성 place가 없으면 비어 있을 수 있다
- 채널 목록이 비어 있는 경우, 비어 있는 이유를 설명하는 안내 문구를 함께 노출한다

### 2.1 활성 클라우드 기준 조회

채팅 홈의 모든 데이터 조회는 현재 `activeServer` 기준을 따른다.

- `activeServer.kind === 'relay'`이면 relay 기준 context(`cid: 'default'`)로 조회한다
- `activeServer.kind === 'cloud'`이면 `activeServer.cloudId`를 `cid`로 사용하여 조회한다
- place 목록, channel 목록 모두 이 기준을 공유한다
- `activeServer`가 바뀌면 기존 조회 결과를 즉시 폐기하고 새 기준으로 재조회한다

코드 근거:

- `libs/web-core/src/session/types.ts` — `ActiveServerContext` 타입 (`kind: 'relay' | 'cloud'`)

초기 안내 문구 예시:

- 아직 사이트 세션에 연결되지 않아 채널을 불러오지 못했습니다
- 상단에서 클라우드와 사이트를 먼저 선택해 주세요

## 3. 화면 구성

### 3.1 상단 Cloud 영역

클라우드 목록은 두 섹션으로 분리한다.

- 내 클라우드
- 초대 클라우드

표시 항목:

- cloud 이름
- cloud id
- 현재 활성 여부
- 초대 클라우드 여부

용어 규칙:

- `default` cloud는 중계서버 기반 기본 클라우드이며 `내 클라우드` 섹션에 포함한다
- broker 기준으로 소유한 일반 cloud도 `내 클라우드` 섹션에 포함한다
- invite 기반으로 유입된 cloud는 `초대 클라우드` 섹션에 배치한다

### 3.2 중간 Place 목록

표시 항목:

- place 이름
- place id
- 현재 선택 여부

동작:

- 현재 활성 cloud 기준으로 place 목록을 조회한다
- 목록 갱신은 캐싱 스트림을 우선 사용한다

### 3.3 하단 Channel 목록

표시 항목:

- channel 이름
- 마지막 메시지 요약
- 마지막 메시지 시각
- 현재 선택 여부

동작:

- 현재 활성 place 기준으로 channel 목록을 조회한다
- 목록 갱신은 캐싱 스트림을 우선 사용한다

## 4. Cloud 전환 규칙

### 4.1 중계서버 클라우드에서 다른 cloud로 이동

- 현재 relay 기본 상태에서 다른 cloud를 클릭하면 해당 cloud 세션을 새로 생성하거나 복구한다
- cloud 인증이 완료되면 새 cloud 기준 place 목록을 다시 조회한다
- place가 하나 이상 있으면 첫 place 또는 저장된 place를 선택한다

### 4.2 cloud 세션 상태에서 중계서버 클라우드(relay)로 복귀

- 현재 cloud 세션 상태에서 기본(relay) 클라우드를 클릭하면 cloud 세션 로그아웃으로 처리한다 (relay 세션은 유지)
- `activeServer`가 relay로 자동 전환된 시점에 채팅 홈은 relay 기준으로 place / channel 목록을 재조회한다
- cloud 로그아웃 메커니즘(`useLogoutCloudSession` / `resolveActiveServerContext` 자동 전환)과 코드 근거는 [../session/README.md](../session/README.md#cloud-로그아웃)가 정본이다.

### 4.3 내 클라우드 / 초대 클라우드 세션 로그아웃

- 사용자가 현재 접속 중인 내 클라우드 또는 초대 클라우드에서 세션 로그아웃을 수행하면 자동으로 `default` cloud에 다시 연결한다
- 이 동작은 "클라우드 밖으로 이탈"이 아니라 "relay 기본 클라우드로 복귀"로 정의한다
- 복귀 후 place / channel 선택 상태는 `default` cloud 기준으로 다시 계산한다

## 5. Place 전환 규칙

- place 클릭 시 site 전환 로직을 수행한다
- place 전환이 완료되면 해당 place 기준 channel 목록을 다시 조회한다
- 이전 place의 선택 channel은 즉시 해제한다

## 6. Channel 진입 규칙

- channel 클릭 시 채널 상세 페이지로 이동한다
- 선택된 `cloudId`, `placeId`, `channelId`는 라우트 또는 동등한 화면 상태로 복원 가능해야 한다

## 7. 예외 및 빈 상태

- place 목록이 비어 있으면 "현재 클라우드에 연결 가능한 사이트가 없습니다" 문구를 표시한다
- place는 있으나 아직 인증되지 않아 channel 목록을 못 불러오는 경우 명시적으로 구분한다
- cloud 전환 중에는 중복 클릭을 막고 전환 중 상태를 보여준다

## 8. 검증 포인트

- guest 기본 진입 후 `activeServer.kind === 'relay'` 기준 place 목록이 노출되어야 한다
- cloud 선택 시 `activeServer.kind === 'cloud'`, `activeServer.cloudId`가 해당 cloud로 바뀌고 place 목록이 갱신되어야 한다
- 기본(relay) 클라우드 클릭 시 `logoutCloudSession()`이 호출되고 `activeServer`가 relay로 자동 전환되어야 한다
- relay 전환 직후 기존 cloud 기준 place/channel 목록이 즉시 폐기되고 relay 기준으로 재조회되어야 한다
- place 전환 후 channel 목록이 캐싱 스트림 결과로 갱신되어야 한다
- 활성 place가 없을 때 channel 빈 상태 문구가 노출되어야 한다

## 관련 문서

- [room.md](room.md) — 채널 상세 페이지
- [../session/README.md](../session/README.md) — cloud/relay 로그아웃 정본
- [../architecture.SPEC.md](../architecture.SPEC.md) — 전체 아키텍처·상태 전이
