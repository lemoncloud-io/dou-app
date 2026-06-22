# Testbed Chat Specs

`testbed`는 단순 디버그 대시보드가 아니라, 실제 채팅 앱에 가까운 흐름으로
세션 전환, 캐시 스트림, 소켓 상태를 검증하는 실험용 웹 앱이다.

이번 문서 세트는 기존 `web-core usecase` / `data` / `config` 검증 문서를
사용자 흐름 기준으로 다시 정리한 버전이다.

## 문서 구성

1. [전체 아키텍처](./architecture.SPEC.md)
2. [전역 오버레이](./overlay.SPEC.md)
3. [채팅 홈 페이지](./chat-home-page.SPEC.md)
4. [채널 상세 페이지](./chat-room-page.SPEC.md)
5. [설정 페이지](./settings-page.SPEC.md)
6. [로그인 페이지](./login-page.SPEC.md)

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
