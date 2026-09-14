# @chatic/db

저장 엔진 lib. `@chatic/data`가 소유한 `CacheStorage` 인터페이스를 웹(IndexedDB)과
네이티브(WebView 브릿지 → SQLite) 양쪽으로 구현하고, 전역 캐시 검색 구현 2종과 네이티브 캐시
계측을 함께 둔다.

두 가지만 기억하면 된다.

- **어느 어댑터를 쓸지는 이 lib이 정하지 않는다.** 도메인별 저장소 선택은 `@chatic/app-runtime`의 `resolveCacheBackend` 소관이다. 여기는 "고른 뒤 실제로 읽고 쓰는" 어댑터만 있다.
- **엔진 클래스는 팩토리 밖으로 나가지 않는다.** 리포에서 `@chatic/db`를 import하는 파일은 `app-runtime`의 `localFactory` 하나다. 새 소비자를 추가하려면 그 경계를 깨는 이유부터 답해야 한다.

문서 정본은 [docs/architecture.md](./docs/architecture.md)다 — 계약 10종, 어댑터별 동작,
네이티브 읽기 비용, 채널 한정 삭제의 세 경로, 의존 경계와 남은 긴장.
