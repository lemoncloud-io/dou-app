# Project Structure

```Plaintext
src
├── app
│   ├── App.tsx                  # 앱 진입점
│   ├── common                   # 전역 공통 모듈
│   │   ├── components           # 공통 UI 컴포넌트
│   │   ├── hooks                # 전역 범용 Hooks (useQueryString, etc.)
│   │   ├── services             # 외부 연동 서비스 (FCM, Logger, IAP, OAuth ...)
│   │   ├── storages             # 로컬 데이터베이스 & 스토리지 (핵심)
│   │   │   ├── cacheRepository.ts # 스토리지 파사드(Facade) 및 라우터 인터페이스
│   │   │   ├── mmkv             # MMKV 인스턴스 (단순 Preference 전용)
│   │   │   └── sqlite           # op-sqlite 기반 고성능 로컬 RDB
│   │   │       ├── core         # DB 인스턴스, 스키마, 백업/복원 로직
│   │   │       └── datasources  # 도메인별 데이터 소스 (Chat, Channel 등) 및 팩토리
│   │   ├── stores               # 상태 관리 보관소
│   │   ├── utils                # 유틸리티 함수
│   │   └── webview              # WebView Core
│   │       ├── AppWebView.tsx   # 웹뷰 메인 컴포넌트
│   │       ├── core             # Bridge 저수준 로직
│   │       └── hooks            # 웹뷰 전용 Hooks (useAppBridge, useFcmHandler...)
│   ├── features                 # 기능별 모듈 분리
│   │   ├── debug                # 개발자 도구 및 테스트 화면 (Storage, Socket, OAuth 등)
│   │   └── main                 # 메인 화면 (웹뷰)
│   └── navigation               # 네비게이션 설정
└── types                        # 전역 타입 정의
```
