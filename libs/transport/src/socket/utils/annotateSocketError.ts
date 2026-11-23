import type { SocketKind } from '../types';

export const annotateSocketError = (error: unknown, kind: SocketKind, action: string, type: string): unknown => {
    if (!(error instanceof Error) || error.message.includes(type)) return error;
    error.message = `${error.message} - ${kind}.${action}(${type})`;
    return error;
};
