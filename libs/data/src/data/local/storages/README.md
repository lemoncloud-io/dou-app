# Local Storage Adapters (`libs/data/src/data/local/storages`)

`CacheStorage` 인터페이스를 기준으로 웹(IndexedDB) / 네이티브(WebView bridge) 어댑터를 제공합니다.

## 현재 scope 정책

- 현재는 **`cid` 단일 scope**만 사용합니다.
- 각 CRUD 호출 시점에 `DataContextProvider.getContext().cid`를 읽어 scope를 결정합니다.
- `uid` scope는 후속 작업에서 추가할 예정입니다.

## 주요 구성

- `cacheStorage.ts`
    - 공통 인터페이스: `CacheStorage<TType>`
    - 저장 스키마: `CacheSchema<T>`
- `indexedDBAdapter.ts`
    - 웹 구현체
    - 키 포맷: `${type}:${cid}:${id}`
    - 인덱스: `type_cid`
- `nativeDBAdapter.ts`
    - WebView bridge 구현체
    - `nonce` 기반 요청/응답 매칭
    - `replaceAll`은 현재 `fetch -> deleteAll -> saveAll` 3단계
- `index.ts`
    - 도메인별 storage 묶음 생성: `createCacheStorages(contextProvider, storageFactory)`

## 사용 예시

```ts
import {
    createCacheStorages,
    createIndexedDBAdapter,
    createNativeDBAdapter,
    type CacheStorageFactory,
} from '@chatic/data';

const storageFactory: CacheStorageFactory = (type, contextProvider) => {
    const isNative = typeof window !== 'undefined' && !!window.ReactNativeWebView;
    return isNative ? createNativeDBAdapter(type, contextProvider) : createIndexedDBAdapter(type, contextProvider);
};

const storages = createCacheStorages(contextProvider, storageFactory);
await storages.chat.save(chat.id, chat);
```

## 주의 사항

- `CacheStorage`는 호출 시점 context를 읽도록 구현되어야 합니다.
    - 같은 adapter 인스턴스라도 `cid` 변경 후에는 새 scope로 동작해야 합니다.
- `saveAll/replaceAll`은 `id`가 없는 아이템을 무시합니다.
