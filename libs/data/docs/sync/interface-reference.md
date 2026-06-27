# 인터페이스 참조

> 현재 앱 소비 코드와 `libs/data`가 기대하는 최소 표면. 개요는 [README.md](README.md), 도메인별 시나리오는 [domains.md](domains.md) 참조.

## ClientSocketV2

```ts
interface ClientSocketV2 {
    readonly state: ClientSocketState;

    connect(): Promise<void>;
    disconnect(code?: number, reason?: string): Promise<void>;
    destroy(): void;

    request<TInput, TResult>(type: string, data?: TInput, options?: { timeoutMs?: number }): Promise<TResult>;
    send<TInput>(message: SocketMessage<TInput>): void;
    send<TInput>(type: string, data?: TInput): void;

    onState(listener: (event: ClientSocketStateEvent) => void): () => void;
    onError(listener: (event: ClientSocketErrorEvent) => void): () => void;
    onMessage(listener: (event: ClientSocketMessageEvent) => void): () => void;
    onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void;
}
```

> `ClientSocketV2`의 클라이언트 측 요청 제한(in-flight / pending / timeout / client-side 429)은 [../network-layer.md](../network-layer.md#clientsocketv2-요청-제한) 참조.

## Device runtime

```ts
interface DeviceSocketRuntime {
    start(): Promise<void>;
    stop(): Promise<void>;

    startSync(target: SyncTargetDescriptor): void;
    stopSync(target: SyncTargetDescriptor): void;
    stopAllSync(): void;
    listSyncTargets(): SyncTargetDescriptor[];
    updateLocalSnapshot(target: SyncTargetDescriptor, snapshot: unknown): void;

    startCurrentDeviceSync(intervalMs?: number): void;
    startDeviceSync(id: string, intervalMs?: number): void;
}
```

## SyncTargetDescriptor

```ts
interface SyncTargetDescriptor {
    type: string;
    id?: string;
    intervalMs?: number;
    meta?: Record<string, unknown>;
}
```

## 관련 gateway 메서드

| 메서드              | 입력                               | 응답                      |
| ------------------- | ---------------------------------- | ------------------------- |
| `device.save`       | `DeviceBody`                       | `DeviceView`              |
| `device.read`       | `{ id?: string } \| null`          | `DeviceView`              |
| `channel.mine`      | `{ page?, limit? }`                | `ListResult<ChannelView>` |
| `channel.sync`      | `{ since? }`                       | `ChannelSyncView`         |
| `channel.unreads`   | `{}`                               | `UnreadsSummaryView`      |
| `chat.feed`         | `{ channelId, cursorNo?, limit? }` | `ChatFeedResponse`        |
| `chat.read`         | `{ channelId, chatNo }`            | `JoinView`                |
| `join.get`          | `JoinGetRequestBody` (`{ id }`)    | `JoinView`                |
| `join.update`       | `JoinUpdateRequestBody`            | `JoinView`                |
| `channel.syncUsers` | `{ channelId, since? }`            | `ChannelUsersSyncView`    |
| `place.create`      | `PlaceCreateInput`                 | `MySiteView`              |
| `place.get`         | `PlaceGetInput`                    | `MySiteView`              |
| `place.update`      | `PlaceUpdateInput`                 | `MySiteView`              |
| `place.delete`      | `PlaceDeleteInput`                 | `MySiteView`              |
| `cloud.create`      | `CloudCreateInput`                 | `CloudView`               |
| `cloud.get`         | `CloudGetInput`                    | `CloudView`               |
| `cloud.update`      | `CloudUpdateInput`                 | `CloudView`               |
| `cloud.delete`      | `CloudDeleteInput`                 | `CloudView`               |
| `profile.get`       | `ProfileGetInput`                  | `ProfileView`             |
| `profile.get-mine`  | `ProfileGetMineInput \| null`      | `ProfileView`             |
| `profile.set`       | `ProfileSetInput`                  | `ProfileView`             |
| `profile.sync`      | `ProfileSyncInput \| null`         | `SiteProfileSyncView`     |
