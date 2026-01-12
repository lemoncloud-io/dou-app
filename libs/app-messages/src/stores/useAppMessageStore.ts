import { create } from 'zustand';

import { AppMessageTypes } from '../types';

import type { AppMessage, AppMessageType } from '../types';

export type MessageHandler<T extends AppMessageType> = (message: Extract<AppMessage, { type: T }>) => void;

export type MessageHandlers = {
    [T in AppMessageType]: Set<MessageHandler<T>>;
};

export interface AppMessageState {
    handlers: MessageHandlers;
}

export interface AppMessageStore extends AppMessageState {
    addHandler: <T extends AppMessageType>(type: T, handler: MessageHandler<T>) => void;
    removeHandler: <T extends AppMessageType>(type: T, handler: MessageHandler<T>) => void;
    handleMessage: (message: AppMessage) => void;
}

const createInitialHandlers = (): MessageHandlers => {
    const handlers = {} as MessageHandlers;
    Object.values(AppMessageTypes).forEach(type => {
        (handlers as any)[type] = new Set();
    });
    return handlers;
};

export const useAppMessageStore = create<AppMessageStore>()((set, get) => ({
    handlers: createInitialHandlers(),
    addHandler: (type, handler) =>
        set(state => {
            const newHandlers = new Set(state.handlers[type]);
            newHandlers.add(handler);
            return { handlers: { ...state.handlers, [type]: newHandlers } };
        }),
    removeHandler: (type, handler) =>
        set(state => {
            const newHandlers = new Set(state.handlers[type]);
            newHandlers.delete(handler);
            return { handlers: { ...state.handlers, [type]: newHandlers } };
        }),
    handleMessage: (message: AppMessage) => {
        const { handlers } = get();
        handlers[message.type].forEach(handler => handler(message as any));
    },
}));
