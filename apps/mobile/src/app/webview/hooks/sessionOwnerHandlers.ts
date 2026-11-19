import type { WebMessageData } from '@chatic/bridge-messages';

import { readDefaultSessionOwner, writeDefaultSessionOwner } from '../../services/runtime/sessionOwner';
import type { SessionOwner, SessionOwnerFile } from '../../services/runtime/sessionOwner';
import type { SessionOwnerSwitch } from '../../services/runtime/sessionOwnerSwitch';

const isOwner = (value: unknown): value is 'web' | 'native' => value === 'web' || value === 'native';

export interface SessionOwnerHandlerDeps {
    ownerSwitch: SessionOwnerSwitch;
    /** Whether the switch is offered right now; read on every request, since debug mode can change mid-run. */
    allowed: () => boolean;
}

const notOffered = <T extends 'OnFetchSessionOwner' | 'OnSetSessionOwner'>(type: T) => ({
    type,
    success: false as const,
    error: { code: 'NOT_ALLOWED', message: 'The session owner switch is not offered by this build right now.' },
});

/**
 * The overlay's session owner switch (`FetchSessionOwner`, `SetSessionOwner`). Both answer only while
 * `allowed()` holds; otherwise they refuse with `NOT_ALLOWED`, which the overlay shows as "not offered"
 * exactly as it does a build with no handler at all.
 */
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
    /** The file the owner is recorded in for the next start. */
    file: () => SessionOwnerFile;
    /** The owner the next start will have, with every rule applied — read after the write. */
    next: (file: SessionOwnerFile) => SessionOwner;
}

/**
 * The page's default owner (`SetDefaultSessionOwner`). Unlike the switch it is answered on every build,
 * production included, with no debug mode: it is how a web deploy decides which side holds the session
 * on installs nobody switched. It only records — the owner is settled once per launch, so this one keeps
 * its owner and the next start reads the new default. It never touches the switch's own choice.
 */
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
            // A file that cannot be opened is read as the page's at launch anyway; the page only learns
            // that this record did not land.
            return {
                type: 'OnSetDefaultSessionOwner' as const,
                success: false as const,
                error: { code: 'INTERNAL', message: error instanceof Error ? error.message : String(error) },
            };
        }
    },
});
