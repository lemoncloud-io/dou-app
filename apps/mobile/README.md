# Chatic Mobile

`apps/mobile`은 React Native 기반 하이브리드 모바일 앱이다. 네이티브 shell이 WebView를 띄우고,
WebView 안의 웹 앱이 typed bridge message로 모바일 기능을 요청한다.

이 문서들은 코드를 고치기 전에 **소유권과 데이터 흐름**을 먼저 잡기 위한 것이다.
전체 구조는 [architecture](./docs/architecture.md)부터 보고, 바꾸려는 영역의 카테고리 문서로 이동한다.

## 읽는 순서

1. [architecture](./docs/architecture.md) — 앱 전체 구조 지도
2. [native-module](./docs/native-module.md) — Android/iOS 네이티브 모듈
3. [service](./docs/service.md) — 모바일 기능의 실행 경계와 DI
4. [webview](./docs/webview.md) — 웹↔앱 메시지 경계
5. [cache](./docs/cache.md) — SQLite/MMKV 로컬 저장
6. [push](./docs/push.md) — FCM/APNs, 포그라운드 이벤트, 탭 라우팅
7. [upload](./docs/upload.md) — 대용량 파일 업로드
8. [deploy](./docs/deploy.md) — 버전 범프와 스토어 업로드 파이프라인

## 카테고리 맵

| 카테고리                                                                           | 이럴 때 본다                                               | 주요 코드                                                                                                     |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [architecture](./docs/architecture.md)                                             | 앱 구조, 시작 흐름, 계층 소유권                            | `src/main.tsx`, `src/app/App.tsx`, `src/app/features`                                                         |
| [native-module](./docs/native-module.md)                                           | Android/iOS 네이티브 API, 파일/업로드 브릿지, OS 동작      | `src/app/bridge`, `android/app/src/main/java/io/chatic/dou`, `ios/Bridges`                                    |
| [service](./docs/service.md)                                                       | 모바일 도메인 동작, 의존성 주입, 공유 인스턴스             | `src/app/services/provider.ts`, `src/app/services`                                                            |
| [webview](./docs/webview.md) · [디버깅](./docs/webview-debugging.md)               | 웹→앱 메시지, 주입 런타임, 브릿지 핸들러, 원격 인스펙터    | `src/app/webview`                                                                                             |
| [cache](./docs/cache.md)                                                           | SQLite, MMKV, 로컬 data source, 캐시 브릿지 API            | `src/app/database`, `src/app/data/cache`, `src/app/services/cache`                                            |
| [push](./docs/push.md) · [badge](./docs/badge.md) · [deeplink](./docs/deeplink.md) | FCM/APNs, 포그라운드 이벤트, 뱃지 카운트, 탭·딥링크 라우팅 | `src/app/services/notification`, `src/app/services/deeplinks`, `android/app/src/main/java/io/chatic/dou/push` |
| [upload](./docs/upload.md)                                                         | 대용량 파일 업로드, 네이티브 업로드 엔진, 업로드 복구      | `src/app/services/upload`, `src/app/webview/hooks/useUploadHandler.ts`                                        |
| [deploy](./docs/deploy.md)                                                         | 버전 범프, TestFlight/Play 업로드, 배포 자격증명 세팅      | `scripts/version-mobile.js`, `scripts/deploy-mobile.sh`, `fastlane/Fastfile`                                  |

## 작업 규칙

- 고치기 전에 **어느 카테고리 소유인지** 먼저 확인한다.
- WebView 핸들러는 얇게 유지하고, 도메인 동작은 service에 둔다.
- 공유 service 인스턴스는 `services/provider.ts`에서 등록한다.
- 네이티브 브릿지 계약은 TypeScript·Android·iOS 세 곳이 어긋나지 않게 맞춘다.
- 구조·lifecycle·데이터 흐름·브릿지 계약이 바뀌면 해당 문서도 함께 갱신한다.
