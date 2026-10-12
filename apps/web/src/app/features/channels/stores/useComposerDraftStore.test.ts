import { act, renderHook } from '@testing-library/react';

import { useComposerDraft } from '../hooks/useComposerDraft';
import {
    clearComposerDrafts,
    COMPOSER_DRAFT_MAX,
    hasComposerDraft,
    useComposerDraftStore,
} from './useComposerDraftStore';

const texts = () => useComposerDraftStore.getState().texts;

beforeEach(() => {
    useComposerDraftStore.setState({ texts: {}, held: {} });
    localStorage.clear();
    jest.restoreAllMocks();
});

describe('useComposerDraftStore', () => {
    it('keeps a draft per conversation and persists it on the device', () => {
        useComposerDraftStore.getState().setText('c1', 'hello');
        useComposerDraftStore.getState().setText('c1#5', 'reply');

        expect(texts()).toEqual({ c1: 'hello', 'c1#5': 'reply' });
        expect(JSON.parse(localStorage.getItem('chatic.composer.drafts') ?? '{}').state.texts).toEqual({
            c1: 'hello',
            'c1#5': 'reply',
        });
    });

    it('drops a draft emptied in the field, and keeps the state when nothing changes', () => {
        useComposerDraftStore.getState().setText('c1', 'hello');
        useComposerDraftStore.getState().setText('c1', '');
        expect(texts()).toEqual({});

        const before = useComposerDraftStore.getState();
        useComposerDraftStore.getState().setText('c2', '');
        useComposerDraftStore.getState().clear('c3');
        expect(useComposerDraftStore.getState()).toBe(before);
    });

    it('clears one conversation, leaving the rest', () => {
        useComposerDraftStore.getState().setText('c1', 'a');
        useComposerDraftStore.getState().setText('c2', 'b');

        useComposerDraftStore.getState().clear('c1');

        expect(texts()).toEqual({ c2: 'b' });
    });

    it('keeps the newest drafts past the cap, a write moving a conversation to the newest end', () => {
        for (let i = 0; i < COMPOSER_DRAFT_MAX; i += 1) useComposerDraftStore.getState().setText(`c${i}`, 'x');
        // Written again, so it is the newest and survives the next one.
        useComposerDraftStore.getState().setText('c0', 'again');

        useComposerDraftStore.getState().setText('new', 'y');

        expect(Object.keys(texts())).toHaveLength(COMPOSER_DRAFT_MAX);
        expect(texts()['c0']).toBe('again');
        expect(texts()['c1']).toBeUndefined();
        expect(texts()['new']).toBe('y');
    });

    it('keeps working in memory when the device storage refuses the write', () => {
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        expect(() => useComposerDraftStore.getState().setText('c1', 'hello')).not.toThrow();
        expect(texts()).toEqual({ c1: 'hello' });
    });

    it('keeps the waiting files per conversation in memory only, never in device storage', () => {
        const file = { id: 'held-1', source: new File(['x'], 'a.pdf') };
        useComposerDraftStore.getState().setHeld('c1', [file]);
        useComposerDraftStore.getState().setText('c1', 'hello');

        expect(useComposerDraftStore.getState().held).toEqual({ c1: [file] });
        expect(JSON.parse(localStorage.getItem('chatic.composer.drafts') ?? '{}').state).toEqual({
            texts: { c1: 'hello' },
        });

        useComposerDraftStore.getState().setHeld('c1', []);
        expect(useComposerDraftStore.getState().held).toEqual({});
    });

    it('tells a conversation with a draft: text that is not blank, or a waiting file', () => {
        useComposerDraftStore.getState().setText('typed', 'hi');
        useComposerDraftStore.getState().setText('blank', '   ');
        useComposerDraftStore.getState().setHeld('file', [{ id: 'held-1', source: new File(['x'], 'a.pdf') }]);
        const state = useComposerDraftStore.getState();

        expect(hasComposerDraft(state, 'typed')).toBe(true);
        expect(hasComposerDraft(state, 'file')).toBe(true);
        expect(hasComposerDraft(state, 'blank')).toBe(false);
        expect(hasComposerDraft(state, 'none')).toBe(false);
    });

    it('lets every draft go at sign-out, the waiting files included', () => {
        useComposerDraftStore.getState().setText('c1', 'hello');
        useComposerDraftStore.getState().setHeld('c1', [{ id: 'held-1', source: new File(['x'], 'a.pdf') }]);

        clearComposerDrafts();

        expect(texts()).toEqual({});
        expect(useComposerDraftStore.getState().held).toEqual({});
    });
});

describe('useComposerDraft', () => {
    it('reads and writes the draft of its own conversation', () => {
        useComposerDraftStore.getState().setText('c1', 'kept');
        const { result } = renderHook(() => useComposerDraft('c1'));
        expect(result.current[0]).toBe('kept');

        act(() => result.current[1]('typed'));

        expect(result.current[0]).toBe('typed');
        expect(texts()).toEqual({ c1: 'typed' });
    });

    it('takes an updater over the current draft, as a state setter does', () => {
        const { result } = renderHook(() => useComposerDraft('c1'));

        act(() => result.current[1](current => (current.trim() ? current : 'caption back')));

        expect(result.current[0]).toBe('caption back');
    });

    it('swaps to the next conversation’s draft when the scope changes in place', () => {
        useComposerDraftStore.getState().setText('c1', 'one');
        useComposerDraftStore.getState().setText('c2', 'two');
        const { result, rerender } = renderHook(({ scope }) => useComposerDraft(scope), {
            initialProps: { scope: 'c1' },
        });

        rerender({ scope: 'c2' });
        expect(result.current[0]).toBe('two');
        rerender({ scope: 'c3' });
        expect(result.current[0]).toBe('');
    });

    it('writes through a setter made for an earlier scope into that scope, not the current one', () => {
        const { result, rerender } = renderHook(({ scope }) => useComposerDraft(scope), {
            initialProps: { scope: 'c1' },
        });
        const setForC1 = result.current[1];

        rerender({ scope: 'c2' });
        act(() => setForC1('late caption'));

        expect(texts()).toEqual({ c1: 'late caption' });
        expect(result.current[0]).toBe('');
    });
});
