import type { ChatMinePayload } from '@lemoncloud/chatic-sockets-api';

export interface ClientChatMinePayload extends ChatMinePayload {
    placeId: string;
}
