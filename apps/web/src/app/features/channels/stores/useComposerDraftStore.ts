import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ChatAttachmentSource } from '@chatic/runtime-react';

import { deviceStore, persistStorageOver } from '../../../storage';

export const COMPOSER_DRAFT_MAX = 50;

export interface HeldFileDraft {
    id: string;
    source: ChatAttachmentSource;
}

export interface ComposerDraftState {
    texts: Record<string, string>;
    held: Record<string, readonly HeldFileDraft[]>;
    setText: (scope: string, text: string) => void;
    setHeld: (scope: string, files: readonly HeldFileDraft[]) => void;
    clear: (scope: string) => void;
    clearAll: () => void;
}

const without = <T>(record: Record<string, T>, scope: string): Record<string, T> => {
    if (!(scope in record)) return record;
    const { [scope]: _dropped, ...rest } = record;
    return rest;
};

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
            storage: persistStorageOver(deviceStore),
            partialize: state => ({ texts: state.texts }),
        }
    )
);

export const clearComposerDrafts = (): void => useComposerDraftStore.getState().clearAll();

export const hasComposerDraft = (state: Pick<ComposerDraftState, 'texts' | 'held'>, scope: string): boolean =>
    !!state.texts[scope]?.trim() || (state.held[scope]?.length ?? 0) > 0;
