import type { AppMessage, BaseMessage, BridgeResponseMessage, WebMessage } from '@chatic/app-messages';

export type RequestMessage = WebMessage;
export type EventMessage = AppMessage;
export type ResponseMessage = BridgeResponseMessage;

/**
 * The union type of every message spec that can travel over bridge communication.
 */
export type AnyBridgeMessage = RequestMessage | ResponseMessage | EventMessage;

/**
 * The protocol interface responsible for serializing (encoding) and deserializing (decoding) data when exchanging messages between Web and App.
 */
export interface MessageProtocol {
    /**
     * [Serialize] Encodes an object into the bridge transport format (string or binary).
     * @param message The message object to send (one of Request, Response, Event)
     * @returns The serialized string or byte array
     */
    encode(message: AnyBridgeMessage | BaseMessage): string | Uint8Array;

    /**
     * [Deserialize] Parses bridge-received data (string or binary) and decodes it into a message object.
     * @param data The received serialized data
     * @returns The parsed message object (null on parse failure)
     */
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

export interface BridgeFailureConfig {
    code?: string;
    message?: string;
    recoverable?: boolean;
}

export interface EnvironmentConfig {
    /** The Web -> App -> Web round-trip delay. */
    rttDelayMs?: number;
    /** If true, returns a bridge-level failure response for every request without going through the App host. */
    forceFailure?: boolean | BridgeFailureConfig;
    /** If true, the request is never sent to the App host, so WebBridgeClient's timeout can be verified. */
    timeoutMode?: boolean;
    /** A value between 0 and 1. Drops messages at that probability. */
    dropRate?: number;
    /** If true, forces a response type mismatch to occur. */
    responseTypeMismatch?: boolean | string;
    /** If true, forces a malformed bridge response to occur. */
    malformedResponse?: boolean;
    random?: () => number;
}
