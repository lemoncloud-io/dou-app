import { useCallback, type Dispatch, type SetStateAction } from 'react';

import { useComposerDraftStore } from '../stores/useComposerDraftStore';

/**
 * The composer's text for one conversation, kept as its draft (`useComposerDraftStore`): what a page
 * would hold in `useState('')`, except that leaving the room — or the app — and coming back finds it
 * again, and a page whose route params change in place (another room, another thread) reads the new
 * conversation's draft without remounting. Clearing the field after a send clears the draft with it,
 * since an empty draft is not kept.
 *
 * Writes go to the scope the setter was made for: a caption handed back after the composer moved on
 * lands in the conversation it was typed in.
 */
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
