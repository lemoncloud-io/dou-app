# @chatic/data

`@chatic/data`는 WebSocket을 통한 실시간 서버 동기화, IndexedDB를 활용한 로컬 캐싱, 그리고 멀티 탭 간의 데이터 동기화를 UI 계층으로부터 완전히 분리하여 관리합니다.

## 디렉토리 구조 (Directory Structure)

```text
libs/data/src/
├── useDataSync.ts           # 전역 동기화 엔진 (App.tsx에서 단일 호출)
├── hooks/                   # Query Hooks (조회 전용)
├── mutations/               # Mutation Hooks (쓰기 전용)
├── handlers/                # 소켓 메시지 핸들러 (내부용)
├── repository/              # 데이터 저장소 추상화 계층 (내부용)
├── storages/                # DB 어댑터 (IndexedDB / Native)
├── sync-events/             # 이벤트 버스 및 브릿지 로직 (내부용)
├── types/                   # 데이터 및 페이로드 타입 정의
└── index.ts                 # Public API 진입점
```

## 시작하기 (Getting Started)

### 1. 전역 엔진 초기화

애플리케이션 최상단(`App.tsx`)에서 동기화 엔진을 가동합니다. 이 훅은 소켓 라우터와 탭 간 브릿지를 활성화합니다.

```tsx
import { useDataSync } from '@chatic/data';

const App = () => {
    useDataSync();
    return <RouterProvider router={router} />;
};
```

---

## 주요 Hooks 사용법

### 데이터 조회 (Queries)

모든 조회용 훅은 로컬 데이터를 우선 반환하고 백그라운드에서 서버와 동기화(`sync`)를 수행합니다.

```tsx
import { useChats } from '@chatic/data';

const ChatRoom = ({ channelId }) => {
    // 최신 상태를 기억하므로 page나 limit을 변경해도 안전하게 유지됩니다.
    const { messages, isLoading, sync } = useChats({ channelId, limit: 50 });

    const handleLoadMore = () => {
        sync({ page: 2 }); // 기존 파라미터와 병합되어 요청됩니다.
    };

    return (
        <ul>
            {messages.map(msg => (
                <li key={msg.id}>{msg.content}</li>
            ))}
        </ul>
    );
};
```

### 데이터 수정 (Mutations)

수정 요청은 `Promise`를 반환하며, 성공 시에만 후속 UI 로직을 실행할 수 있습니다.

```tsx
import { useChatMutations } from '@chatic/data';

const ChatInput = ({ channelId }) => {
    const { sendMessage, isPending } = useChatMutations(channelId);

    const handleSend = async (content: string) => {
        try {
            await sendMessage({ channelId, content });
            clearInput(); // 성공 시에만 입력창 초기화
        } catch (e) {
            toast.error("전송 실패");
        }
    };

    return <button disabled={isPending.send} onClick={...}>전송</button>;
};
```

## 데이터 흐름 및 통신 방식 (Data Flow & Communication)

`@chatic/data`는 **이벤트 기반 비동기 데이터 흐름**을 지향합니다. UI 컴포넌트, 서버(WebSocket), 그리고 로컬 DB(IndexedDB) 간의 통신은 직접적인 참조 대신 **통합 이벤트 버스**를 통해 느슨하게 연결됩니다.

### 1. 계층별 통신 메커니즘

| 계층 (Layer)    | 통신 대상             | 방식 (Mechanism)          | 설명                                                                                               |
| :-------------- | :-------------------- | :------------------------ | :------------------------------------------------------------------------------------------------- |
| **UI 컴포넌트** | **Hooks / Mutations** | **함수 호출 & 상태 구독** | UI는 훅을 호출하고, 훅이 반환하는 리액트 상태(State)를 구독하여 화면을 갱신합니다.                 |
| **Mutations**   | **WebSocket 서버**    | **WSS Emit (발송)**       | 사용자 액션 발생 시 인증된 소켓을 통해 서버로 명령(`action`)을 전송합니다.                         |
| **Handlers**    | **Repository**        | **메서드 호출**           | 서버 응답을 수신한 핸들러는 해당 데이터를 DB에 영구 저장하기 위해 리포지토리를 호출합니다.         |
| **Repository**  | **Storages**          | **Adapter Pattern**       | 웹(IndexedDB) 또는 앱(Native SQLite) 환경에 맞는 어댑터를 통해 실제 DB에 접근합니다.               |
| **Sync Events** | **Hooks / UI**        | **CustomEvent (Pub/Sub)** | 데이터가 갱신되면 `app-sync-updated` 이벤트를 방출하여, 해당 데이터를 바라보는 모든 훅을 깨웁니다. |

### 2. 시나리오별 통신 상세

#### **A. 데이터 조회 및 동기화 (Query Flow)**

1. **UI:** `useChats({ channelId })` 호출.
2. **Hook:** `Repository`를 통해 로컬 DB의 기존 메시지를 즉시 로드하여 UI에 노출.
3. **Hook:** 동시에 서버에 `chat:feed` 액션을 쏴서 최신 데이터를 요청.
4. **Socket:** 서버 응답 도착 → `chatHandler`가 로컬 DB 갱신 → `notifyAppUpdated` 이벤트 방출.
5. **Hook:** 이벤트를 수신하고 로컬 DB에서 최신 데이터를 다시 읽어 UI 상태 업데이트.

#### **B. 데이터 생성 및 반영 (Mutation Flow)**

1. **UI:** `sendMessage({ content })` 호출.
2. **Mutation:** 서버에 메시지 전송 및 `Promise` 대기.
3. **Socket:** 서버가 "저장 완료" 응답을 줌.
4. **Handler:** 새 메시지를 로컬 DB에 저장하고 앱 전체에 알림.
5. **Mutation:** 이벤트 확인 후 `Promise.resolve()` 반환 → UI에서 로딩 스피너 종료.

#### **C. 멀티 탭 동기화 (Cross-Tab Sync)**

1. **Tab A:** 유저가 채팅 전송.
2. **Tab A:** `useBroadcastBridge`가 로컬에서 발생한 이벤트를 감지하고 `BroadcastChannel`로 전파.
3. **Tab B:** `useBroadcastBridge`가 채널로부터 메시지 수신 후 자신의 환경에서 동일한 `CustomEvent` 발생.
4. **Tab B UI:** 별도의 소켓 통신 없이도 Tab A와 동일하게 화면이 실시간 갱신됨.

---

## 개발 가이드 (For Developers)

- **Public API 관리**: 새로운 기능 추가 시 반드시 `src/index.ts`에 노출하여 캡슐화를 유지하세요.
- **이벤트 전파**: 데이터 변경 시 반드시 `notifyAppUpdated`를 호출하여 다른 탭과 훅들이 즉시 반응하게 하세요.
- **엄격한 타입**: 모든 페이로드는 `@lemoncloud/chatic-sockets-api`를 상속받아 정의하여 런타임 에러를 방지합니다.

### 역할 분담 및 확장 원칙 (Scope & Responsibility)

`@chatic/data`는 **"데이터의 공급과 동기화"** 라는 본질적인 기능에만 집중합니다. 따라서 다음과 같은 원칙을 준수해야 합니다.

- **DB 및 네트워크 전담**: 이 라이브러리는 오직 원격 서버와의 통신과 로컬 DB의 무결성만을 관리합니다.
- **일반적 유즈케이스의 분리**: 도메인별 복합적인 비즈니스 로직이나 특정 화면에 특화된 유즈케이스(예: 특정 조건의 메시지 필터링 루틴, 복합 로직 기반 알림 처리 등)는 **이 라이브러리의 훅을 기반으로 실제 사용처(Web/App)에서 정의**해야 합니다.
    - **Bad**: 라이브러리 내부에 `useMySpecificFilteredChats` 같은 특정 화면 전용 훅을 직접 구현하는 것.
    - **Good**: 라이브러리의 `useChats`를 사용하여 실제 서비스 코드(Web App)에서 `useMessageSearch` 같은 유즈케이스 훅을 별도로 조합해 만드는 것.
- **상태 최소화**: UI를 위한 임시 UI 상태(Modal Open 여부, Input Text 등)는 여기서 관리하지 않습니다. 오직 DB로부터 동기화된 데이터 상태만 관리합니다.
