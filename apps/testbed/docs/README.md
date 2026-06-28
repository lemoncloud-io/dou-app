# Testbed Chat Specs

`testbed`는 단순 디버그 대시보드가 아니라, 실제 채팅 앱에 가까운 흐름으로
세션 전환, 캐시 스트림, 소켓 상태를 검증하는 실험용 웹 앱이다.

이번 문서 세트는 기존 `web-core usecase` / `data` / `config` 검증 문서를
사용자 흐름 기준으로 다시 정리한 버전이다.

## 시작 지점

- [전체 아키텍처](./architecture.SPEC.md) — 계층 책임, 전역 UX 규칙, 라우트, 상태 전이 (**전체 그림은 여기부터**)

## 기능 폴더

| 폴더                            | 개요(README)                              | 그 외 문서                                                                                      |
| ------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [chat/](./chat/README.md)       | 채팅 홈 — cloud/place/channel 탐색·전환   | [room.md](./chat/room.md) — 채널 상세(메시지 조회·페이징·전송)                                  |
| [session/](./session/README.md) | 설정 — 세션 제어(cloud/relay 로그아웃)    | [login.md](./session/login.md) — 이메일 로그인 · [invite.md](./session/invite.md) — 초대 플로우 |
| [overlay/](./overlay/README.md) | 전역 오버레이 — 세션/웹/DB/소켓 진단 패널 | —                                                                                               |

## 구현 순서 제안

1. 앱 shell, 라우트, 전역 상태 연결
2. 전역 guest login / dark mode / 하단 네비게이션
3. 채팅 홈 페이지
4. 채널 상세 페이지
5. 설정 페이지
6. 오버레이 상태 패널
7. 이메일 로그인 페이지

## 공통 전제

- 모듈명은 `testbed`
- 앱 경로는 `apps/testbed`
- Nx 기반 모노레포 내 애플리케이션으로 구성
- React 기반으로 구동
- 별도 웹 URL 제공
- 이후 모바일 WebView 부착 가능
- `app-runtime`, `web-core`, `data` 의존성 사용
- 기본 세션은 relay guest session이며, 필요 시 cloud session으로 승격/전환한다
