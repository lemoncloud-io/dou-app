# 📦 @chatic/data

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

## 🛠️ 개발 가이드 (For Developers)

- **Public API 관리**: 새로운 훅을 만들면 반드시 `src/index.ts`에 추가하여 외부에서 접근 가능하도록 하세요.
- **이벤트 버스**: 데이터 변경 시 `notifyAppUpdated`를 호출하여 앱 전체에 동기화 신호를 보냅니다. 도메인(`chat`, `channel`, `user`, `site`, `invite`)을 정확히 지정하세요.
- **엄격한 타입**: 엄격한 타입관리를 위해 `@lemoncloud/chatic-sockets-api` 타입을 계승하여 정의합니다.
