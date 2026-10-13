import { useRef, useState } from 'react';

import { act, renderHook } from '@testing-library/react';

import type { MentionCandidate } from '../utils/mentionInput';
import { useMentionComposer } from './useMentionComposer';

const EVERYONE: MentionCandidate = { id: '@everyone', label: '전체', everyone: true };
const MINSU: MentionCandidate = { id: 'u2', label: 'Minsu' };
const RAIN: MentionCandidate = { id: 'u3', label: '레인' };
const CANDIDATES = [EVERYONE, MINSU, RAIN];

/**
 * A real textarea standing in for the composer's field. The page's field is controlled, so its value
 * is written from the hook's text on every render, before the layout effects place the caret — the
 * order React commits a controlled field in.
 */
const setup = ({ enabled = true, scope = 'room-1' } = {}) => {
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    const hook = renderHook(
        ({ scope: currentScope }: { scope: string }) => {
            const [content, setContent] = useState('');
            field.value = content;
            const inputRef = useRef(field);
            const composer = useMentionComposer({
                enabled,
                candidates: CANDIDATES,
                content,
                setContent,
                inputRef,
                scope: currentScope,
            });
            return { content, ...composer };
        },
        { initialProps: { scope } }
    );
    /** Types `value` with the caret left at its end, as a keystroke does. */
    const type = (value: string) =>
        act(() => {
            field.value = value;
            field.setSelectionRange(value.length, value.length);
            hook.result.current.onChange(value);
        });
    /** Moves the caret without typing — a tap in the text. */
    const tapAt = (caret: number) =>
        act(() => {
            field.setSelectionRange(caret, caret);
            field.dispatchEvent(new MouseEvent('click'));
        });
    const ids = () => hook.result.current.suggestions.map(row => row.id);
    return { ...hook, field, type, tapAt, ids };
};

afterEach(() => {
    document.body.innerHTML = '';
});

describe('useMentionComposer', () => {
    describe('the list', () => {
        it('lists everyone and the members for a bare @, and narrows as the name is typed', () => {
            const { type, ids } = setup();

            type('hi @');
            expect(ids()).toEqual(['@everyone', 'u2', 'u3']);

            type('hi @mi');
            expect(ids()).toEqual(['u2']);
        });

        it('lists nothing without an @ being typed', () => {
            const { type, ids } = setup();

            type('ops@here');
            expect(ids()).toEqual([]);
        });

        // A 1:1 or a self chat has no list at all, even for a bare @.
        it('lists nothing when switched off', () => {
            const { result, type, ids } = setup({ enabled: false });

            type('@');
            expect(ids()).toEqual([]);
            expect(result.current.content).toBe('@');
        });

        // A tap moves the caret without a change; the list goes where the caret went.
        it('follows the caret into an @ word and out of it', () => {
            const { type, tapAt, ids } = setup();

            type('@mi and more');
            expect(ids()).toEqual([]);

            tapAt(3);
            expect(ids()).toEqual(['u2']);

            tapAt(12);
            expect(ids()).toEqual([]);
        });

        it('closes when the field loses focus', () => {
            const { field, type, ids } = setup();
            field.focus();

            type('@');
            act(() => field.blur());

            expect(ids()).toEqual([]);
        });
    });

    describe('a pick', () => {
        it('writes the picked name into the text, closes the list and puts the caret after it', () => {
            const { result, field, type, ids } = setup();

            type('hi @mi');
            act(() => result.current.pick(MINSU));

            expect(result.current.content).toBe('hi @Minsu ');
            expect(ids()).toEqual([]);
            expect(field.selectionStart).toBe(10);
        });

        // With the caret inside `@Mi|nsu`, the rest of the word must not be left behind.
        it('replaces the whole @ word the caret is in', () => {
            const { result, type, tapAt } = setup();

            type('@Minsu');
            tapAt(3);
            act(() => result.current.pick(MINSU));

            expect(result.current.content).toBe('@Minsu ');
        });

        // The list was opened on an earlier `@`; the caret has since gone somewhere with no `@` at all.
        it('writes nothing when the caret is no longer in an @ word', () => {
            const { result, field, type, ids } = setup();

            type('hi @mi there');
            act(() => {
                field.setSelectionRange(6, 6);
                result.current.onChange('hi @mi there');
            });
            expect(ids()).toEqual(['u2']);

            field.setSelectionRange(12, 12);
            act(() => result.current.pick(MINSU));

            expect(result.current.content).toBe('hi @mi there');
            expect(ids()).toEqual([]);
        });
    });

    describe('the mention a send carries', () => {
        it('names the people and everyone still in the text, and keeps the picks until they are cleared', () => {
            const { result, type } = setup();

            type('@');
            act(() => result.current.pick(MINSU));
            type(`${result.current.content}@`);
            act(() => result.current.pick(EVERYONE));
            const text = result.current.content.trim();

            expect(result.current.mentionFor(text)).toEqual({ userIds: ['u2'], all: true });
            // Reading is not sending: a press that sent nothing leaves the picks in place.
            expect(result.current.mentionFor(text)).toEqual({ userIds: ['u2'], all: true });

            act(() => result.current.clearPicks());
            expect(result.current.mentionFor(text)).toBeUndefined();
        });

        // A caption whose photos were all refused comes back to the field; its names mean the same people.
        it('puts the cleared picks back for a text that came back unsent', () => {
            const { result, type } = setup();

            type('@');
            act(() => result.current.pick(MINSU));
            act(() => result.current.clearPicks());
            act(() => result.current.restoreClearedPicks());

            expect(result.current.mentionFor('@Minsu hello')).toEqual({ userIds: ['u2'] });
        });

        // A chat app's mention goes in one keystroke; half a name would call nobody.
        it('deletes the whole picked name on a backspace at its end, and forgets the pick', () => {
            const { result, field, type } = setup();

            type('hi @');
            act(() => result.current.pick(MINSU));
            type('hi @Minsu');
            type('hi @Mins');

            expect(result.current.content).toBe('hi ');
            expect(field.selectionStart).toBe(3);
            expect(result.current.mentionFor('hi @Minsu')).toBeUndefined();
        });

        it('drops a pick whose name was deleted before the send', () => {
            const { result, type } = setup();

            type('@');
            act(() => result.current.pick(MINSU));
            type('never mind');

            expect(result.current.mentionFor('never mind')).toBeUndefined();
        });

        it('forgets its picks when the field is emptied', () => {
            const { result, type } = setup();

            type('@');
            act(() => result.current.pick(MINSU));
            type('');

            expect(result.current.mentionFor('@Minsu typed again by hand')).toBeUndefined();
        });

        // A draft stays with its conversation; who its names meant does not follow the user elsewhere.
        it('forgets its picks when the conversation changes', () => {
            const { result, type, rerender } = setup();

            type('@');
            act(() => result.current.pick(MINSU));
            rerender({ scope: 'room-2' });

            expect(result.current.mentionFor('@Minsu ')).toBeUndefined();
        });
    });
});
