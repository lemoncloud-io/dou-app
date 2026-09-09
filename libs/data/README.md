# @chatic/data

앱이 쓸 데이터 표면 전부를 조립해 하나의 배럴로 내보내는 **headless data layer** — 도메인 모델과
매퍼, 로컬 캐시의 저장·stream 발행, 서버로 나가는 outbound 호출, 그리고 이 셋을 묶는 repository
facade.

원칙은 셋이다.

- **읽기는 항상 local stream** — UI는 `observe*`만 구독한다.
- **remote는 side-effect command** — write/refresh는 명시적 메서드 호출이다.
- **UI는 네트워크를 직접 호출하지 않는다.**

소켓 연결의 생애주기(연결·재인증·sync 타이밍)는 이 lib이 소유하지 않는다 — `libs/app-runtime`의
sync orchestrator 소관이다.

문서 정본은 [`docs/`](./docs/architecture.md)다.

| 문서                                           | 다루는 것                                        |
| ---------------------------------------------- | ------------------------------------------------ |
| [docs/architecture.md](./docs/architecture.md) | 목적·원칙·범위·시나리오·다이어그램·배선 (진입점) |
| [docs/local.md](./docs/local.md)               | stream 모델, scope와 캐시 슬롯, chat cursor      |
| [docs/remote.md](./docs/remote.md)             | gateway 매핑, DataSource별 호출, 이름 규약       |
| [docs/repositories.md](./docs/repositories.md) | 도메인 13종, cache clear, 퇴장과 재입장          |
