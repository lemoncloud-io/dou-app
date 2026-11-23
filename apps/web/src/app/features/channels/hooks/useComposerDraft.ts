import { useCallback, type Dispatch, type SetStateAction } from 'react';

import { useComposerDraftStore } from '../stores/useComposerDraftStore';

export const useComposerDraft = (scope: string): [string, Dispatch<SetStateAction<string>>] => {
    const text = useComposerDraftStore(state => state.texts[scope] ?? '');
    const setText = useCallback(
        (next: SetStateAction<string>) => {
            const store = useComposerDraftStore.getState();
            const current = store.texts[scope] ?? '';
            store.setText(scope, typeof next === 'function' ? next(current) : next);
        },
        [scope]
    );
    return [text, setText];
};
