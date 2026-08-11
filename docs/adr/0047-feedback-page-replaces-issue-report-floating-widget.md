# ADR-0047: 이슈 신고 플로팅 위젯을 걷어내고, 마이페이지 진입 "피드백 보내기" 페이지로 전환한다

> 상태: Accepted · 결정일: 2026-08-07
> 관련: [ADR-0017](./0017-issue-report-floating-widget.md) (이 결정으로 대체됨) · [ADR-0013](./0013-home-screen-web-ui-kit-migration.md) (web-ui-kit 우선) · [ADR-0046](./0046-web-feature-ownership-and-barrel-hygiene.md) (피처 소유권·배럴 위생)

## 맥락 (Context)

[ADR-0017](./0017-issue-report-floating-widget.md)로 만든 **드래그 가능한 플로팅 이슈 신고 위젯**(FAB + 오버레이 폼)이 프로덕션에 상주 중이다. 이번에 디자인이 이 기능을 **"피드백 보내기"라는 마이페이지 하위 전용 화면**으로 재정의했다.

### 새 디자인이 요구하는 것

| Figma 노드                                                                                     | 내용                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [3293-39607](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3293-39607&m=dev) | 마이페이지 — **"이슈 신고 버튼" 스위치 행이 사라지고**, 약관·버전 카드 최상단에 `피드백 보내기` 네비 행이 생김                   |
| [3739-26078](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3739-26078&m=dev) | `의견 보내기` 풀스크린 페이지 — 뒤로가기 top bar, 3줄 헤드카피 + 안내 불릿 2개, 단일 textarea, 사진 첨부, 하단 플로팅 `제출하기` |
| [3744-26323](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3744-26323&m=dev) | Textarea 컴포넌트 스펙 — focus / scroll / filled 3상태, h198 · radius24 · border `#3A3C40`                                       |
| [3739-26274](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3739-26274&m=dev) | `사진 첨부는 5장까지 가능해요.` 에러 토스트                                                                                      |
| [3293-40098](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3293-40098&m=dev) | 바텀 네비 — active 배경 `#222325` → `rgba(3,13,35,0.7)`, inactive 탭 opacity 54%, 라벨 tracking `-0.1px`                         |

### 착수 전 코드 조사

- 현행 위젯: [features/issue-report/](../../apps/web/src/app/features/issue-report/) — `IssueReportHost` / `IssueReportFab` / `IssueReportOverlay` / `useDraggable` / `buildReportContext`. `AppRuntime`에서 1회 마운트.
- 전송 시 [buildReportContext.ts](../../apps/web/src/app/features/issue-report/lib/buildReportContext.ts)가 **최근 로그 50개 + 디바이스/버전/뷰포트/경로 스냅샷**을 자동 첨부한다. 진단 가치가 이 기능의 핵심이며 UI 교체와 무관하다.
- 노출 토글: `issueReportHidden` preference + [MyPage.tsx:196](../../apps/web/src/app/features/mypage/pages/MyPage.tsx) 스위치 행.
- **`ui/components/ReportIssueDialog.tsx`는 죽은 코드다.** ADR-0017이 "확장하지 않는다"고 결정한 뒤 배럴 export만 남고 실사용처가 0이다.
- **`reportIssue(title, message, extras)`의 `title`은 필수**다([common.ts:168](../../libs/web-core/src/api/common.ts)). admin-v2 `report-logs` 목록도 title로 행을 그린다. 그런데 새 디자인에는 제목 입력이 없다.
- **web-ui-kit에 Textarea가 없다.** 현행 오버레이는 `@chatic/ui-kit`의 shadcn Textarea를 직접 끌어 쓰는 계층 이탈 상태다.
- **이미지 업로드 API가 여전히 없다.** ADR-0017이 스크린샷을 Phase 2로 미룬 조건이 그대로다.
- 마이페이지 정책 카드는 `isGuest` 분기 밖이라 비로그인 사용자에게도 렌더된다. `reportIssue`는 `isAuthenticated: false`를 페이로드에 실어 정상 동작한다.

## 결정 (Decision)

### 1. 플로팅 위젯을 완전히 제거한다

`IssueReportHost` · `IssueReportFab` · `IssueReportOverlay` · `useDraggable` 및 `AppRuntime` 마운트, `issueReportHidden` preference와 마이페이지 스위치 행을 모두 삭제한다. 진입점은 **마이페이지 "피드백 보내기" 한 곳**으로 단일화한다.

`buildReportContext`(로그·디바이스 자동 첨부)는 **그대로 살려 새 페이지가 재사용**한다. 이것이 이 기능의 실질 가치다.

죽은 코드 `ui/components/ReportIssueDialog.tsx`와 배럴 export, `reportIssue.*` i18n 키도 함께 정리한다.

### 2. `/mypage/feedback` 전용 페이지를 신설한다

`features/feedback/`을 신규 피처로 만들고 `ROUTES.mypage.feedback`으로 라우팅한다. `features/issue-report/`는 폴더째 대체된다.

**게스트도 접근 가능**하다 — 정책 카드와 같은 위치에 있고 API가 미인증을 지원한다.

### 3. 제목 입력 필드를 디자인에 없더라도 추가한다

Figma에는 본문 textarea 하나뿐이지만, `reportIssue`의 필수 `title`을 본문에서 자동 추출하면 관리자 목록의 가독성이 운에 맡겨진다. **본문 textarea 위에 필수 단일줄 TextField(web-ui-kit `TextField` 재사용)를 배치**한다.

제출 버튼은 **제목·본문 둘 다 공백 아닌 값이 있을 때만** 활성화한다.

### 4. 입력 제약

- 문자 종류 제한 없음 — 한글·영문·숫자·특수문자·이모지 모두 허용. 별도 필터링/정규화를 넣지 않는다.
- 글자수 카운터를 **UI에 노출하지 않는다**. 다만 `maxLength` 안전망으로 **5000자** 상한을 건다. 로그 50줄 + 디바이스 스냅샷이 같은 페이로드에 실리므로, 대용량 붙여넣기가 제출 전체를 실패시키는 것을 막기 위함이다.

### 5. 제출 완료는 토스트 + 마이페이지 복귀

성공 시 토스트를 띄우고 즉시 이전 화면으로 돌아간다. 기획서의 "완료 안내 팝업" 대신 기존 앱 관례(토스트)를 따른다. 실패 시 `destructive` 토스트로 안내하고 입력값은 보존한다.

### 6. `Textarea`를 web-ui-kit foundation으로 신규 추가한다

`libs/web-ui-kit/src/foundations/input/Textarea.tsx` + Storybook 스토리. Figma 3744-26323의 focus / scroll / filled 3상태를 구현한다. 앱이 `@chatic/ui-kit` shadcn Textarea를 직접 참조하던 계층 이탈을 여기서 해소한다.

### 7. 바텀 네비 디자인을 수정한다

[FloatingTabBar](../../libs/web-ui-kit/src/composites/navigation/FloatingTabBar.tsx)의 active 배경을 `#222325` → `rgba(3,13,35,0.7)`로, inactive 탭에 opacity 54%를, 라벨 tracking을 `-0.1px`로 바꾼다.

### 범위에서 제외 (보류)

**사진 첨부 전체.** 섹션·갤러리 접근·5장 제한·초과 토스트 모두 이번에 구현하지 않으며, 화면에 비활성 UI로도 노출하지 않는다. 이미지 업로드 API가 생긴 뒤 별도 작업으로 붙인다 — ADR-0017의 Phase 2 조건이 아직 충족되지 않았다.

## 대안 (Alternatives)

- **FAB을 dev/stage에서만 유지** — QA 제보 편의는 남지만, 진입점이 둘로 갈리고 드래그·영속화 코드가 통째로 유지보수 대상으로 남는다. 새 페이지가 어느 화면에서든 2탭이면 닿으므로 편의 손실이 크지 않다고 판단해 기각.
- **제목을 본문 앞 30자로 자동 생성** — 사용자 입력 부담이 없고 Figma와 정확히 일치하지만, 관리자 목록에서 제목이 문장 중간에서 잘리고 요약 품질이 입력자에게 달린다. 명시적 필드가 운영 비용을 더 줄인다고 보고 기각.
- **백엔드에 `title` 옵셔널화 요청** — 디자인에 가장 충실하지만 이번 작업이 API 협의에 블로킹된다. 기각.
- **사진 첨부를 로컬까지 구현하고 전송만 보류** — API 연결 시 배선만 하면 되지만, 눌러도 아무것도 남지 않는 UI를 사용자에게 노출하게 된다. 기각.
- **완료 안내를 팝업(AlertDialog)으로** — 기획서 문구에 충실하나 확인 탭이 한 단계 늘고 앱의 다른 제출 흐름과 어긋난다. 기각.

## 결과 (Consequences)

**얻는 것**

- 진입점이 하나로 정리되고, 프로덕션 화면 위에 상시 떠 있던 FAB이 사라져 컨텐츠 가림·오탭이 없어진다.
- `useDraggable`, 위치 영속화, `issueReportHidden` preference, 죽은 `ReportIssueDialog`까지 순감(net deletion)한다.
- web-ui-kit에 Textarea가 생겨 앱의 shadcn 직접 참조가 사라진다. 다른 화면에서도 재사용 가능.
- 로그·디바이스 자동 첨부는 유지되므로 리포트의 진단 가치는 그대로다.

**감수하는 것**

- **어디서든 즉시 제보**가 사라진다. 문제를 겪은 화면에서 마이페이지로 이동해야 하므로 제보 시점의 화면 맥락이 흐려진다. `buildReportContext`의 `path`가 제보 화면이 아닌 피드백 페이지 경로를 담게 되는 문제가 있어, 구현 시 **진입 직전 경로를 넘겨 기록**해야 한다.
- 마이페이지 도달이 필요해 제보 건수가 줄어들 수 있다.
- 제목 필드가 Figma에 없다 — 디자인과 구현이 한 요소만큼 어긋난 상태로 남는다. 차기 디자인 갱신 시 반영 필요.
- 사진 첨부 기대가 기획서에 있으나 이번 릴리스에 없다. QA/기획과 보류 사실 공유 필요.
- 5000자 상한은 UI에 표시되지 않으므로, 초과 입력 시 사용자가 이유를 모른 채 타이핑이 멈춘다.
- `issueReportHidden`을 `true`로 저장해둔 사용자의 로컬 preference 값이 고아로 남는다(동작에는 무해).

## 다음 단계

[[dev-2_implement]] 스펙 작성 단계로 넘어간다. 스펙에서 확정할 것: 헤드카피/불릿/라벨 i18n 키 정의(ko/en), Textarea 3상태 픽셀 스펙, 진입 경로 보존 방식, 삭제 대상 파일 목록.
