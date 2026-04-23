# Storage Adapter Guide

프론트에서는 `createStorageAdapter(type, cid)`를 기본 진입점으로 사용하면 됩니다.

- 웹: `IndexedDB`
- 네이티브 앱 WebView: 브릿지 메시지 -> 네이티브 `SQLite`

## 사용법

```ts
import { createStorageAdapter } from '@chatic/data';

const chatStorage = createStorageAdapter('chat', cid);

await chatStorage.save(chat.id, chat);
const oneChat = await chatStorage.load(chat.id);
const allChats = await chatStorage.loadAll();

await chatStorage.replaceAll(serverChats);
await chatStorage.delete(chat.id);
```

## 마이그레이션

1. 프론트 코드에서 직접 환경 분기하지 않습니다.
2. 앱 코드에서 `createIndexedDBAdapter`, `createNativeDBAdapter` 직접 import를 제거합니다.
3. `createStorageAdapter(type, cid)`로 교체합니다.
4. 하나의 저장소 스코프에서는 같은 `type`, `cid`를 유지합니다.

Before:

```ts
const storage = isNativeApp() ? createNativeDBAdapter('chat', cid) : createIndexedDBAdapter('chat', cid);
```

After:

```ts
const storage = createStorageAdapter('chat', cid);
```

## Notes

- `id`는 필수입니다. 빈 값이나 누락된 값을 넘기지 않습니다.
- `load()`는 데이터가 없으면 `null`을 반환합니다.
- 네이티브 `replaceAll()`은 현재 `fetch -> delete -> save` 순서로 동작하며 아직 원자적이지 않습니다. saveAll() 사용을 추천합니다.
