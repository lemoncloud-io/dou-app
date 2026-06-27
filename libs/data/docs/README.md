# libs/data 문서

`libs/data`는 repository · local data source · remote data source를 조립해 앱이 사용할
**headless data layer**를 제공한다. 핵심 원칙은 하나다 — **읽기는 항상 local stream, remote는 side-effect command, UI는 네트워크 콜을 직접 하지 않는다.**

socket lifecycle(연결/재인증/sync 타이밍)은 `libs/data`가 소유하지 않는다. `libs/data`는 외부 orchestrator(`app-runtime/sync`)가 넘긴 결과를 local cache에 반영하고 stream으로 재방출한다.

## 시작 지점

- [network-layer.md](./network-layer.md) — gateway 호출 ↔ repository 캐시 반영 분리, gateway 매핑, `ClientSocketV2` 요청 제한 (**경계는 여기부터**)

## 기능 폴더

| 폴더                                      | 개요(README)                                                             | 그 외 문서                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| [repositories/](./repositories/README.md) | repository V2 — data facade, `observe*`/`refresh*`/write command 계약    | —                                                                                                                                     |
| [local/](./local/README.md)               | local data layer V2 — snapshot 저장·stream 발행, scope 분리              | —                                                                                                                                     |
| [sync/](./sync/README.md)                 | 서버 소켓 동기화 스펙과 `libs/data` 해석 (개요·도메인 방식 표·운영 규칙) | [domains.md](./sync/domains.md) — 도메인별 시나리오 · [interface-reference.md](./sync/interface-reference.md) — 인터페이스·gateway 표 |

## 문서 규칙

- 각 폴더의 `README.md`가 그 영역의 개요다. 도메인별 시나리오·인터페이스 같은 중요사항은 같은 레벨의 별도 파일로 둔다.
- 같은 사실은 한 곳(정본)에만 쓰고 나머지는 링크한다 — `ClientSocketV2` 요청 제한은 [network-layer.md](./network-layer.md), 동기화 도메인 시나리오는 [sync/domains.md](./sync/domains.md).
