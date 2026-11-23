import type { WebMessageData } from '@chatic/bridge-messages';

import { readDefaultSessionOwner, writeDefaultSessionOwner } from '../../services/runtime/sessionOwner';
import type { SessionOwner, SessionOwnerFile } from '../../services/runtime/sessionOwner';
import type { SessionOwnerSwitch } from '../../services/runtime/sessionOwnerSwitch';

const isOwner = (value: unknown): value is 'web' | 'native' => value === 'web' || value === 'native';

export interface SessionOwnerHandlerDeps {
    ownerSwitch: SessionOwnerSwitch;
    allowed: () => boolean;
}

const notOffered = <T extends 'OnFetchSessionOwner' | 'OnSetSessionOwner'>(type: T) => ({
    type,
    success: false as const,
    error: { code: 'NOT_ALLOWED', message: 'The session owner switch is not offered by this build right now.' },
});

export const createSessionOwnerHandlers = ({ ownerSwitch, allowed }: SessionOwnerHandlerDeps) => ({
    handleFetchSessionOwner: async (_message: WebMessageData<'FetchSessionOwner'>) => {
        if (!allowed()) return notOffered('OnFetchSessionOwner');
        return { type: 'OnFetchSessionOwner' as const, success: true as const, data: ownerSwitch.read() };
    },
    handleSetSessionOwner: async (message: WebMessageData<'SetSessionOwner'>) => {
        if (!allowed()) return notOffered('OnSetSessionOwner');
        const owner = message.data?.owner;
        if (!isOwner(owner)) {
            return {
                type: 'OnSetSessionOwner' as const,
                success: false as const,
                error: { code: 'INVALID_OWNER', message: `Unknown session owner: ${String(owner)}` },
            };
        }
        return { type: 'OnSetSessionOwner' as const, success: true as const, data: ownerSwitch.set(owner) };
    },
});

export interface DefaultSessionOwnerHandlerDeps {
    file: () => SessionOwnerFile;
    next: (file: SessionOwnerFile) => SessionOwner;
}

export const createDefaultSessionOwnerHandler = ({ file, next }: DefaultSessionOwnerHandlerDeps) => ({
    handleSetDefaultSessionOwner: async (message: WebMessageData<'SetDefaultSessionOwner'>) => {
        const owner = message.data?.owner;
        if (owner !== null && !isOwner(owner)) {
            return {
                type: 'OnSetDefaultSessionOwner' as const,
                success: false as const,
                error: { code: 'INVALID_OWNER', message: `Unknown session owner: ${String(owner)}` },
            };
        }
        try {
            const opened = file();
            writeDefaultSessionOwner(opened, owner);
            return {
                type: 'OnSetDefaultSessionOwner' as const,
                success: true as const,
                data: { default: readDefaultSessionOwner(opened) ?? null, next: next(opened) },
            };
        } catch (error) {
            return {
                type: 'OnSetDefaultSessionOwner' as const,
                success: false as const,
                error: { code: 'INTERNAL', message: error instanceof Error ? error.message : String(error) },
            };
        }
    },
});
