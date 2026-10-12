import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import type { ChatAttachmentSource } from '@chatic/data';

/** How many conversations keep a typed draft. Past it the one written longest ago goes. */
export const COMPOSER_DRAFT_MAX = 50;

/** A file from the files entry, waiting above the composer for its send button. */
export interface HeldFileDraft {
    /** The chip's key, and what its × hands back. A shell file's address would do, a page `File` has none. */
    id: string;
    source: ChatAttachmentSource;
}

export interface ComposerDraftState {
    /**
     * The composer's unsent text per conversation (a room's channel id, or `channelId#rootNo` for a
     * thread), oldest written first. An empty draft is not kept.
     */
    texts: Record<string, string>;
    /**
     * The files waiting above each conversation's composer (`useChatImageAttach`), for as long as the
     * app runs. In memory only, never persisted: a page `File` cannot be stored, and a shell file is a
     * copy the app sweeps from its pick folder after a day — one kept that long may be gone at the
     * send, which then fails as any gone shell file does. In the store rather than beside it so the
     * chat list can show a room whose only draft is a file.
     */
    held: Record<string, readonly HeldFileDraft[]>;
    setText: (scope: string, text: string) => void;
    setHeld: (scope: string, files: readonly HeldFileDraft[]) => void;
    /** Lets one conversation's typed text go; its waiting files stay. */
    clear: (scope: string) => void;
    clearAll: () => void;
}

/**
 * localStorage behind a guard. A draft is a convenience: storage that is full, blocked or missing
 * (a private window, a WebView with storage off) must cost the draft, never the composer it sits under.
 */
const safeLocalStorage: StateStorage = {
    getItem: name => {
        try {
            return localStorage.getItem(name);
        } catch {
            return null;
        }
    },
    setItem: (name, value) => {
        try {
            localStorage.setItem(name, value);
        } catch {
            // Full or blocked: the draft lives in memory for this run instead.
        }
    },
    removeItem: name => {
        try {
            localStorage.removeItem(name);
        } catch {
            // Nothing to do: there was nowhere it could have been kept.
        }
    },
};

const without = <T>(record: Record<string, T>, scope: string): Record<string, T> => {
    if (!(scope in record)) return record;
    const { [scope]: _dropped, ...rest } = record;
    return rest;
};

/**
 * What was typed in each conversation's composer and not sent, so leaving a room — or the app — and
 * coming back finds it where it was — and the files waiting above it, for as long as the app runs.
 * The text is kept on the device: a draft is not account data and has no server
 * field. Only the composer's own text: a message being edited has its own field, and the composer is
 * locked meanwhile.
 *
 * A write moves the conversation to the newest end, so the cap drops the draft written longest ago.
 */
export const useComposerDraftStore = create<ComposerDraftState>()(
    persist(
        set => ({
            texts: {},
            held: {},
            setText: (scope, text) =>
                set(state => {
                    if (text === '') {
                        const texts = without(state.texts, scope);
                        return texts === state.texts ? state : { texts };
                    }
                    if (state.texts[scope] === text) return state;
                    const entries = Object.entries(without(state.texts, scope));
                    entries.push([scope, text]);
                    return { texts: Object.fromEntries(entries.slice(-COMPOSER_DRAFT_MAX)) };
                }),
            clear: scope =>
                set(state => {
                    const texts = without(state.texts, scope);
                    return texts === state.texts ? state : { texts };
                }),
            setHeld: (scope, files) =>
                set(state => {
                    if (files.length > 0) return { held: { ...state.held, [scope]: files } };
                    const held = without(state.held, scope);
                    return held === state.held ? state : { held };
                }),
            clearAll: () => set({ texts: {}, held: {} }),
        }),
        {
            name: 'chatic.composer.drafts',
            storage: createJSONStorage(() => safeLocalStorage),
            // The waiting files are not storable (above): only the typed text outlives the run.
            partialize: state => ({ texts: state.texts }),
        }
    )
);

/** Lets every draft go — the typed text and the waiting files. The next account must not see them. */
export const clearComposerDrafts = (): void => useComposerDraftStore.getState().clearAll();

/** Whether a conversation has a draft worth showing: typed text that is not blank, or a waiting file. */
export const hasComposerDraft = (state: Pick<ComposerDraftState, 'texts' | 'held'>, scope: string): boolean =>
    !!state.texts[scope]?.trim() || (state.held[scope]?.length ?? 0) > 0;
