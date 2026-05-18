import type { RequestMessage, ResponseMessage, EventMessage } from '../../common';

export interface BridgeAdapter {
    postMessage(message: RequestMessage): void;
    onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void;
}
