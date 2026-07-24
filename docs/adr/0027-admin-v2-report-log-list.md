# ADR-0027: admin-v2 리포트 로그 목록 조회 화면

> 상태: Accepted · 결정일: 2026-07-23

## 맥락 (Context)

`libs/web-core/src/api/common.ts`의 `reportError`(자동 수집)와 `reportIssue`(사용자
이슈 리포트 위젯)는 둘 다 `${DOU_ENDPOINT}/hello/report`로 POST하며, 실제 진단
payload(에러 메시지·stack·http·user·cloud·device·network·env·url·timestamp,
issue의 경우 최근 로그·버전·경로까지)를 `SlackReportBody.message`에 **JSON 문자열로
직렬화**해 담는다. `save: true`라 전송 이력이 백엔드에 저장된다.

이렇게 쌓인 리포트를 관리자가 admin-v2에서 조회할 화면이 필요하다. 조회 API는:

```
GET ${DOU_ENDPOINT}/mocks/0/list   (= 명세상 /dou-v1/mocks/0/list)
Param<any>{}  Body<None>{}  → ListResult<MockView, AggrResult>
@see chatic-backend-api #0.26.701
```

저장(`/hello/report`)과 조회(`/mocks/0/list`)가 같은 DOU 백엔드라, admin-v2가 이미
쓰는 `webTransport.buildSignedRequest(...)`를 그대로 사용할 수 있다.

제약/미지수:

- **`MockView`에는 `title`/`message` 최상위 필드가 없다.** 리포트 본문은
  `meta`(CoreModel 파생, `string | any`) 안에 묻혀 있고, 최상위로 노출되는 건
  `id, name, ns, type, stereo, uid, meta, createdAt, updatedAt` 정도다.
- `/mocks/0/list`가 **텍스트 검색·기간(createdAt range) 쿼리 파라미터를 지원하는지**
  프론트 리포에서 확인 불가(백엔드 소관). 실제 응답 shape(payload가 `meta`에 객체로
  들어오는지 JSON 문자열인지)도 미확인.
- admin-v2에는 아직 `socket-lab` 피처만 있고, **공용 테이블 컴포넌트가 없다.**
  리스트는 `api/*Api.ts`(webTransport) + `hooks/use-*-list.ts`(react-query) +
  `pages/*Page.tsx` + `routes/index.tsx` 조합으로 만들며 UI는 Tailwind/인라인 직접
  작성이 관례다.

## 결정 (Decision)

admin-v2에 **관리자용 리포트 로그 목록 화면**을 새 피처로 추가한다.

**포함:**

- 조회 대상: **전체 리포트**(모든 사용자). `reportError` + `reportIssue` 둘 다 표시하고,
  제목 접두어(`[app] error` vs `[app] issue: ...`)로 type을 구분한다. 특정 유저(uid)
  기준 필터는 하지 않는다.
- 데이터 소스: `GET ${DOU_ENDPOINT}/mocks/0/list` → `ListResult<MockView, AggrResult>`.
  `webTransport.buildSignedRequest({ method: 'GET', baseURL: \`${DOU_ENDPOINT}/mocks/0/list\` })`로 호출.`DOU_ENDPOINT`는 `@chatic/web-core`에서 가져온다(`/hello/report`와 동일 베이스).
- 피처 구조: `socket-lab`을 미러링해 `apps/admin-v2/src/app/features/<feature>/`에
  `api/`(webTransport 호출 + 응답 매핑) · `hooks/`(react-query `useQuery`) ·
  `pages/` · `routes/`를 두고, `src/app/routes.tsx`(및 사이드바 네비)에 등록한다.
- 목록 컬럼(요약): type(error/issue), 제목, env, app, 시각(createdAt). 정렬은 최신순.
- 필터/컨트롤: **텍스트 검색 + 기간(날짜) 필터** 2종만. env/app 칩은 이번 범위 제외.
- 상세: 행 클릭 시 **사이드 드로우(모달)**. `message`의 JSON을 파싱해
  `ErrorReportPayload`/issue extras 필드를 섹션별로 렌더한다 — message, stack,
  componentStack, http(status/code/responseData), user(uid/name/role/…),
  cloud(cloudId/backend/placeId/…), device, network, 그리고 issue의 최근 로그·version·
  path·viewport. 표시 데이터 세트는 `apps/web`의 이슈 리포트 위젯(`IssueReportOverlay`
  → `buildReportContext`)이 첨부하는 항목을 기준으로 삼는다. 파싱 실패 시 raw JSON 폴백.

**제외:**

- "내 것만 보기"(uid 필터), env/app 필터 칩, 리포트 삭제/편집 등 쓰기 액션.
- 실시간 스트리밍/자동 새로고침(수동 조회 + react-query refetch로 충분).

## 대안 (Alternatives)

- **"내가 보낸 것만" uid 서버 필터** — 명령의 "내 로그목록" 문구에 대응. 그러나 (1)
  범위가 관리자용 전체 모니터링으로 확정됐고, (2) 리포트의 uid가 `MockView.uid`로
  스탬핑되는지 미확인이라 서버 필터 신뢰 불가. 폐기.
- **`@lemoncloud/chatic-backend-api` 생성 클라이언트 사용** — 해당 SDK는 `MockView`/
  `AggrResult` 타입만 제공하고 `/mocks/0/list` 클라이언트 메서드가 없다. admin-v2 관례인
  `webTransport` 직접 호출을 택함.
- **행 인라인 확장 / 요약만(상세 없음)** — payload가 크고 진단에 stack·http·user·cloud가
  필수라, 맥락을 유지하는 사이드 드로우가 실사용에 낫다고 판단해 폐기.
- **env/app 필터 칩 추가** — 사용자가 텍스트+기간만 선택. 이번 범위 제외(후속 여지).

## 결과 (Consequences)

- **장점**: 저장/조회가 동일 백엔드·동일 transport라 신규 인프라 없이 붙는다. 자동
  수집(`reportError`)까지 한 화면에서 봐 제품 에러 추적이 실질적으로 가능해진다.
- **트레이드오프 / 리스크**:
    - 상세 뷰가 `SlackReportBody.message`에 직렬화된 JSON shape에 결합된다. 백엔드
      저장 포맷이 바뀌면 파싱이 깨지므로 **방어적 파싱 + raw JSON 폴백**을 둔다.
    - `/mocks/0/list`의 검색·기간 파라미터 지원이 미확인. **구현 단계에서 실제 응답과
      파라미터를 먼저 찍어 확정**한다. 서버 미지원 시 검색/기간은 불러온 페이지 대상
      클라이언트 필터로 폴백하며(현재 페이지 한정이라 부분 검색), 이 한계를 UI에 명시한다.
    - 실제 `MockView` 응답의 payload 위치(`meta` 객체/문자열 vs 재구성 필요)도 구현
      시 검증이 선행돼야 한다.
    - 화면이 **모든 사용자의** uid·이름·cloud 정보를 노출한다. 접근은 기존
      `ProtectedRoute`(관리자 인증)에만 의존하므로, 추가 권한 게이팅이 필요한지는 후속
      판단 대상(현재 범위에선 기존 게이트로 충분하다고 봄).

## 다음 단계

이 ADR을 입력으로 `dev-2_implement`의 스펙 작성(Phase A)으로 넘어간다. 스펙에서
가장 먼저 다룰 것: `/mocks/0/list` 실제 응답 shape와 지원 쿼리 파라미터 확정.
