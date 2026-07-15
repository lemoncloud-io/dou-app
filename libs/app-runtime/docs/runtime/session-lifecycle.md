# Runtime 마운트 라이프사이클 (Host)

## 1. 목적

`RuntimeConnectionHost`가 `webTransport` 초기화 선행 조건을 보장하고, `@chatic/web-core`의 백그라운드 세션 훅(relay keep-alive)을 인라인으로 호출하면서 `app-runtime`의 바인더들을 올바른 순서로 마운트하는 방식을 다룬다.

---

## 2. `RuntimeConnectionHost` — 조립 루트 + init 게이트

과거 별도의 `TransportBootstrap` 컴포넌트가 하던 transport 준비 게이팅은 **`RuntimeConnectionHost`에 흡수**됐다. Host가 다음을 직접 소유한다:

1. **웹코어 init 게이트** — `useInitWebCore()`가 `initializeRelaySession`을 1회 구동한다. 완료 전(`isWebCoreReady === false`)에는 자식 트리를 렌더하지 않고 `null`을 반환해, 선행 의존성 없는 상태에서 바인더가 일찍 마운트되는 것을 차단한다.
2. **delegate 소유** — `const delegate = useSocketSessionDelegate()`로 per-kind 소켓 인증 delegate를 만들어 소켓 바인더에 넘긴다. 앱이 delegate를 주입하지 않는다(Host props는 `{ binding, children }`뿐).
3. **relay keep-alive** — `useRelaySessionKeepAlive(true)`를 Host에서 직접 호출한다(게이트보다 위에서 호출돼 init 진행 여부와 무관하게 relay 세션 부재 시 백그라운드 게스트 로그인으로 복구). 별도 render-null 러너 컴포넌트는 없다.
4. **자식 마운트 순서**.

```tsx
export const RuntimeConnectionHost = ({ binding, children }) => {
    const isWebCoreReady = useInitWebCore(); // web-core 단일 init 드라이버
    const delegate = useSocketSessionDelegate();
    useRelaySessionKeepAlive(true); // relay 세션 부재 시 백그라운드 게스트 로그인으로 복구

    if (!isWebCoreReady) return null; // 초기화 완료 전 하위 트리 렌더 차단

    return (
        <>
            <RuntimeDataBinder binding={binding} />
            <SocketBinder binding={binding} delegate={delegate} />
            <SocketReauthBinder binding={binding} delegate={delegate} />
            {children}
        </>
    );
};
```

- **역할 분리**: 상태 전이·API 호출은 web-core 훅이 소유하고, Host는 인라인 훅 호출 + 바인더 마운트 단위일 뿐이다.
- 토큰 refresh는 Host에서 돌리지 않는다 — 소켓 토큰(relay 주기 refresh 포함)은 SDK `AuthController`가 만료 기반으로 소유한다. web-core에는 주기 refresh 루프가 없다([../../../web-core/docs/hooks/orchestration.md](../../../web-core/docs/hooks/orchestration.md)).

---

## 3. 라이프사이클 흐름도

```mermaid
flowchart TD
  Host["RuntimeConnectionHost (useInitWebCore + useRelaySessionKeepAlive)"]
  Host -- isWebCoreReady === false --> Pending["자식 렌더링 차단 (null)"]
  Host -- isWebCoreReady === true --> Mount["자식 트리 마운트"]

  Mount --> DataBinder["RuntimeDataBinder (context 동기화)"]
  Mount --> SocketBinder["SocketBinder (relay/cloud 슬롯 부팅)"]
  Mount --> Reauth["SocketReauthBinder (same-connection 재인증)"]
```

1. **세션 유지** — Host의 인라인 `useRelaySessionKeepAlive`가 relay 세션을 유지·복구한다.
2. **반영** — 세션이 갱신돼 활성 서버가 바뀌면 `useRuntimeBinding`을 거쳐 `RuntimeDataBinder`/`SocketBinder`/`SocketReauthBinder`가 이를 data/socket 엔진에 주입한다.

---

## 관련 문서

- [../architecture.md](../architecture.md) — 전체 아키텍처·오케스트레이션 매핑
- [./README.md](./README.md) — `RuntimeBinding` 파생 규칙 + 바인더 역할
- [../socket/README.md](../socket/README.md) — 소켓 부팅·재인증·switch/logout
