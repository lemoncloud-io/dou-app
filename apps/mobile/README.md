# Project Structure

```Plaintext
src
├── app
│   ├── App.tsx                  # 앱 진입점
│   ├── common                   # 전역 공통 모듈
│   │   ├── components           # 공통 UI 컴포넌트
│   │   ├── hooks                # 전역 범용 Hooks (useDeviceId, etc.)
│   │   ├── services             # 서비스 집합 (Storage, FCM, Logger, ...)
│   │   ├── utils                # 유틸리티 함수
│   │   └── webview              # WebView Core
│   │       ├── AppWebView.tsx   # 웹뷰 메인 컴포넌트
│   │       ├── core             # Bridge 저수준 로직
│   │       └── hooks            # 웹뷰 전용 Hooks (useAppBridge, useFcmHandler...)
│   ├── features                 # 기능별 모듈 분리
│   │   ├── debug                # 개발자 도구 및 테스트 화면
│   │   └── main                 # 메인 화면 (웹뷰)
│   └── navigation               # 네비게이션 설정
└── types                        # 전역 타입 정의
```
