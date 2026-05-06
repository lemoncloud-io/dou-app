# Repository Layer & Data Provider Specification

## 1. 배경

현재 `libs/data/src/data/remote/data-sources`의 RemoteDataSource는 소켓 송수신과 도메인 이벤트 변환을 담당한다. 화면 훅과 mutation 훅은 아직 로컬 캐시, 소켓 요청, 응답 대기를 직접 조합하고 있어 데이터 접근 정책이 분산되어 있다.
Repository 레이어는 RemoteDataSource 상위에서 도메인별 데이터 접근 API를 제공하고, `DataProvider`를 통해 외부(UI/Screen)에 통합된 인터페이스를 제공하여 데이터 계층과 뷰 계층의 결합도를 낮추는 것을 목적으로 한다.

## 2. 목표

- 도메인별 Repository 인터페이스와 구현체를 분리한다.
- Repository 구현체는 RemoteDataSource 인터페이스에 의존한다.
- 소켓 요청은 `SocketRequestManager`를 통해 `ref` 기반 Promise로 제어한다.
- `DataProvider` 모듈은 web 모듈에서 최종적으로 주입하는 방식으로 처리된다.
- 이후 `LocalDataSource`가 주입될것을 예상하며 아키텍처를 설계한다.
- 구현해야할 `Repository`는 현재`RemoteDataSource`와 1:1로 매핑된다.
- `InviteCloudRepository` 라는것도 구현해야한다. 해당 Repository는 Remote모듈과는 연동되지는 않고 순수 LocalDataSource와 연동된다. (종합적으로 구현해야할 Repository는 7개가 된다.)

## 4. 도메인 매핑 (Domain Mapping)

| Repository              | RemoteDataSource           |
| :---------------------- | :------------------------- |
| `AuthRepository`        | `IAuthRemoteDataSource`    |
| `ChatRepository`        | `IChatRemoteDataSource`    |
| `ChannelRepository`     | `IChannelRemoteDataSource` |
| `JoinRepository`        | `IJoinRemoteDataSource`    |
| `UserRepository`        | `IUserRemoteDataSource`    |
| `SiteRepository`        | `ISiteRemoteDataSource`    |
| `InviteCloudRepository` | -                          |

## 5. 제약 조건 및 요청 처리 정책 (Constraints & Policies)

1 **요청 파이프라인**:

- Repository 메서드는 RemoteDataSource의 발신 메서드를 호출한다.
- 발신 시 `SocketRequestManager.request()`가 `ref`를 생성하거나 외부에서 주입된 `ref`를 사용한다.
- RemoteDataSource가 서버 응답을 도메인 이벤트로 변환하면 `SocketRequestManager`가 같은 `ref`를 가진 이벤트를 찾아 Promise 결과를 resolve/reject 한다.
  2 **직접 접근 금지**:
- UI/Hook 계층은 절대 RemoteDataSource나 SocketManager에 직접 접근할 수 없으며, 오직 `DataProvider`가 노출하는 `repositories` 객체를 통해서만 통신해야 한다.

## 6. 테스트 범위

- 각 Repository가 대응 RemoteDataSource 인터페이스 메서드를 호출하는지 검증한다.
- `RepositoryRequestOptions.ref`와 `timeoutMs`가 `SocketRequestManager.request()`로 전달되는지 검증한다.

---

## 7. 추가 요구사항

- `RemoteDataSource`로 소캣 요청 데이터를 수신하기위해선 `private readonly domainEventBus: IEventBus<DomainEventMap>`를 활용한다. 이벤트를 리스닝하는 기능도 추가해야 한다.
- `DataProvider`는 web 모듈에 구현하며, 훅과 연동될 수 있도록 해야한다. 현재 구현된 DataProvider는 이전하거나 제거한다.
- `Repository`레이어의 기능들은 이후 `cid`와 같은 context를 추가적으로 요구하기때문에 context를 주입하는 과정이 필요하며, context는 외부 변경에따라 모듈 내부에서도 유동적으로 변경되어야한다.
- `InviteCloudRepository`는 우선 인터페이스만 생성해둔다. `IInviteCloudLocalDataSource`는 제거한다.
- `RepositoryTypes.ts`는 이름을 리팩터링한다. ex: types.ts
- `listen` 기능은 `domainEventBus`로 넘어온 이벤트를 `repository` 에서 수신하여 이후 local 캐시업데이트와 같은 사이트 이펙트에 사용하기 위함이기 때문에 외부로 노출시켜서는 안된다.
- 변경된 코드에 대한 주석들을 꼼꼼하게 달아야한다.
- `types.ts`는 갓 모듈 형태가되지 않도록 유형별로 코드를 분리해주어야한다.
- `context`(sid,uid) 추가에 따라 `DataProvider` 에 주입 형태를 업데이트 해야한다.
- `types.ts`에 있는 `requestRemote`를 BaseRepository 안에 넣어 통합적인 클래스로 관리하도록 하는 방향에 대한 검토가 필요할 것 같다.

## 8. 추가 요구사항

- `SocketDispatcher` 또한 인터페이스화 하여 DataProvider에서 생성 및 주입할 수 있도록 한다.
- 요청-응답과 관계없이 오로지 소켓으로 리스닝 되는 데이터를 UI 레이어에서 감지할 수 있어야하는데, 메시지 유형별 리스너를 구현해야한다.
