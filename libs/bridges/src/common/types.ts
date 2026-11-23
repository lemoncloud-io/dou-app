import type { AppMessage, BaseMessage, BridgeResponseMessage, WebMessage } from '@chatic/bridge-messages';

export type RequestMessage = WebMessage;
export type EventMessage = AppMessage;
export type ResponseMessage = BridgeResponseMessage;

export type AnyBridgeMessage = RequestMessage | ResponseMessage | EventMessage;

export interface MessageProtocol {
    encode(message: AnyBridgeMessage | BaseMessage): string | Uint8Array;

    decode(data: string | Uint8Array): AnyBridgeMessage | null;
}

export interface IMessageQueue<T> {
    enqueue(item: T): void;
    dequeue(): T | undefined;
    isEmpty(): boolean;
    size(): number;
    clear(): void;
    getAll(): T[];
}
