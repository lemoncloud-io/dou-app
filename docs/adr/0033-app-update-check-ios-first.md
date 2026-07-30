# ADR-0033: 앱 업데이트 안내 — 라이브 버전 직접 조회, iOS 우선 적용

> 상태: Accepted · 결정일: 2026-07-29

## 맥락 (Context)

- 앱(WebView 하이브리드)의 현재 버전과 스토어에 실제 게시된(라이브) 버전을 비교해, 웹 화면에서 업데이트 안내 팝업을 노출하고 스토어로 이동시키는 기능이 필요하다.
- 기존에는 모바일 셸이 iTunes lookup으로 iOS 버전만 확인해 `window.CHATIC_APP_*` 전역 주입 + 네이티브 Alert로 처리했다. 웹이 원하는 시점에 조회할 수단(request/response)이 없고, `shouldUpdate`가 주입 경로에선 문자열, bridge push에선 boolean으로 타입이 불일치했다.
- 핵심 제약: **심사중(승인 전) 버전을 "업데이트 있음"으로 오탐하면 안 된다.** 사용자가 스토어에 가도 받을 수 없는 버전을 안내하게 되기 때문.
- Android는 라이브 버전을 조회할 공개 API가 없다 (Play Developer API는 서버 인증 필요).

## 결정 (Decision)

1. **버전 소스 = 실제 게시된 라이브 버전만 사용한다.**
   - iOS: 앱 내에서 iTunes lookup(`https://itunes.apple.com/lookup?bundleId=io.chatic.dou`)으로 조회. 승인·출시된 버전만 반환되므로 self-correcting이며 인증·백엔드가 불필요하다.
   - Android: 백엔드 엔드포인트(`GET /app-version?platform=android`, 서버가 Play Developer API로 조회)가 유일한 안전한 소스이나, **이번 범위에서 제외**한다.
2. **범위 = iOS 우선(iOS-first).** Android는 versionService에서 항상 "업데이트 없음"으로 안전 처리한다 (현재도 미지원이므로 회귀 아님). 계약(contract)은 플랫폼 중립으로 설계해 Android 백엔드 연동 시 프론트 계층 변경이 최소화되도록 한다.
3. **통신 = request/response 추가 + 기존 주입 유지.**
   - `libs/app-messages`에 `CheckAppUpdate`/`OnCheckAppUpdate`(응답: `{platform, currentVersion, latestVersion, updateAvailable, storeUrl, forceUpdate?}`), `OpenStore`/`OnOpenStore` 계약 추가.
   - 웹이 `appBridge.checkAppUpdate()`로 on-demand 조회, 네이티브가 결과 반환. `updateAvailable`을 boolean으로 반환해 기존 문자열 주입의 타입 불일치를 해소한다.
   - 기존 `window.CHATIC_APP_*` 전역 주입은 첫 렌더용으로 유지.
4. **모바일 로직 = 서비스로 추출.** 기존 `useAppVersionCheck` 훅 로직을 `apps/mobile/src/app/services/version`(기존 서비스 패턴: types/클래스/provider 싱글턴)으로 이관하고, 훅·주입·알림·브리지 핸들러는 서비스의 소비자가 된다.
5. **팝업 = 선택형 업데이트 안내.** 버전당 1회 노출(persist, `usePreferenceStore`에 `dismissedUpdateVersion` 추가), 강제 업데이트 아님. `forceUpdate` 필드만 계약에 예약해 둔다.

**포함:** app-messages 계약, versionService(iOS iTunes 조회 + 비교 + 스토어 오픈), 기존 훅/주입 리팩터, WebView 브리지 핸들러, 웹 appBridge 확장, 웹 업데이트 안내 팝업, MyPage 스토어 이동 정리.

**제외(후속 작업):** Android 라이브 버전 조회(백엔드 `GET /app-version` 준비 후 연동), 강제 업데이트 UI, What's New 표시, 네이티브 앱 레포 쪽 `registerHandler` 배선(이 repo 밖 — 별도 확인 필요).

## 대안 (Alternatives)

- **Firebase Remote Config로 최신 버전 배포** — 폐기. 콘솔/CI에서 버전 bump 시점에 수동 발행하면 심사중 버전을 라이브로 오탐하는 창이 생기고, 라이브 버전 직접 조회로 대체 가능해지자 RC·신규 네이티브 의존성·네이티브 리빌드·발행 스크립트가 전부 불필요해졌다.
- **웹에서 직접 iTunes lookup 호출** — 폐기. 버전 판단 책임이 네이티브 셸에 있고(현재 버전도 DeviceInfo로 네이티브만 안다), 브라우저 CORS 제약도 있다.
- **주입 전역(`CHATIC_APP_*`)만으로 처리** — 폐기. 첫 렌더 이후(foreground 복귀 등) 재조회가 불가능하고, 문자열/boolean 타입 불일치를 고착시킨다.
- **Android도 이번에 포함** — 보류. 백엔드 엔드포인트가 선행되어야 하며, 준비 전까지는 어떤 프론트 구현도 오탐 위험만 만든다.

## 결과 (Consequences)

- **얻는 것:** 심사중 오탐이 구조적으로 불가능(라이브 버전만 조회). iOS는 백엔드·인증 없이 동작. 웹이 원하는 시점(ready/foreground)에 조회 가능. 버전 로직이 서비스로 모여 테스트 가능해짐.
- **감수하는 것:**
  - Android 사용자는 백엔드 연동 전까지 업데이트 안내를 받지 못한다 (기존과 동일).
  - iTunes lookup은 CDN 캐시로 출시 직후 수 시간 지연될 수 있다 — 선택형 안내이므로 허용.
  - 네이티브 앱 레포의 브리지 핸들러 등록은 이 repo 밖 작업으로 남는다.
- Android 연동 시: versionService의 `getLatestVersion('android')`만 백엔드 fetch로 교체하면 되고, 계약·웹 팝업·스토어 이동은 그대로 재사용된다.
