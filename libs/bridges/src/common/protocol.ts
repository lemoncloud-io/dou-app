import type { RequestMessage, ResponseMessage, EventMessage } from './types';

export interface MessageProtocol {
    encode(message: RequestMessage | ResponseMessage | EventMessage): string | Uint8Array;
    decode(data: string | Uint8Array): RequestMessage | ResponseMessage | EventMessage;
}

export const JsonProtocol: MessageProtocol = {
    encode: message => JSON.stringify(message),
    decode: data => JSON.parse(data as string),
};
