# testbed 문서

`testbed`는 디버그 대시보드가 아니라 **실제 채팅 앱에 가까운 흐름으로 런타임을 검증하는 실험용 웹
앱**이다. 세션 전환, 캐시 스트림, 소켓 상태를 화면에서 직접 확인하는 것이 목적이고, `app-runtime`과
`data`를 실제 앱과 같은 방식으로 조립해 쓴다. 기본 세션은 relay guest이고 필요하면 cloud로
승격·전환한다.

## 어디를 볼까

| 문서                                                                   | 다루는 것                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [architecture.SPEC.md](./architecture.SPEC.md)                         | 앱 shell·라우트·의존 조립, 세션 상태 전이 전체                            |
| [chat/README.md](./chat/README.md)                                     | 채팅 홈 — cloud/place/channel 나열과 전환                                 |
| [chat/room.md](./chat/room.md)                                         | 채널 상세                                                                 |
| [channel-place-management.SPEC.md](./channel-place-management.SPEC.md) | place·channel 생성과 이름 수정(쓰기 흐름 검증)                            |
| [session/README.md](./session/README.md)                               | 설정 화면 — 로그아웃 등 명시적 세션 액션. **cloud/relay 로그아웃의 정본** |
| [session/login.md](./session/login.md)                                 | 이메일 로그인 페이지                                                      |
| [session/invite.md](./session/invite.md)                               | 초대 생성 → 코드 복사 → 수락 → 타겟 순차 전환                             |
| [overlay/README.md](./overlay/README.md)                               | 전역 진단 오버레이 — 세션·런타임·DB·소켓 상태 조회                        |

## 이 문서들의 성격

원래는 앱을 만들기 전 쓴 `*.SPEC.md` 일곱 편이었고, 구현 뒤에 주제별 폴더(`chat/` · `session/` ·
`overlay/`)로 옮겨 적으면서 코드 근거를 갱신했다. **옮겨 적은 쪽만 남겼다** — 루트에 같은 내용의
SPEC이 나란히 있어 어느 쪽이 맞는지 알 수 없었고, 실제로 낡은 쪽은 항상 SPEC이었다(삭제된
`libs/web-core` 경로, `cacheReadList`/`DataRepositoriesV2` 같은 옛 이름).

`architecture.SPEC.md`와 `channel-place-management.SPEC.md`는 대응하는 폴더 문서가 없어 그대로
남아 있다 — 이름만 SPEC이고 내용은 현행 서술이다.
