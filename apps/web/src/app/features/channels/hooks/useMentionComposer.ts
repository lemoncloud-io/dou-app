import {
    type Dispatch,
    type RefObject,
    type SetStateAction,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import type { ChatMentionBody } from '@chatic/data';

import {
    applyMentionPick,
    collectMention,
    filterMentionCandidates,
    findMentionQuery,
    type MentionCandidate,
    type MentionPick,
    type MentionQuery,
} from '../utils/mentionInput';

interface UseMentionComposerInput {
    /** Off in a 1:1 and in a self chat: there is nobody to pick out of a room that small. */
    enabled: boolean;
    /** The rows the list can offer, in display order — the everyone row first, then members. */
    candidates: readonly MentionCandidate[];
    /** The field's text, owned by the page (its draft). */
    content: string;
    setContent: Dispatch<SetStateAction<string>>;
    inputRef: RefObject<HTMLTextAreaElement | null>;
    /** The conversation the field is in. A pick made in one conversation never travels to another. */
    scope: string;
}

export interface MentionComposer {
    /** The field's change handler: writes the text and works out whether an `@` is being typed. */
    onChange: (value: string) => void;
    /** What the list shows now — empty when no `@` is being typed or nothing matches. */
    suggestions: MentionCandidate[];
    /** Writes the picked name into the text and remembers who it means. */
    pick: (candidate: MentionCandidate) => void;
    /** The `@` button: starts an `@` at the caret, or reopens the one the caret is in, and opens the list. */
    openList: () => void;
    /** The mention a send of `text` would carry. Reads the picks and leaves them in place. */
    mentionFor: (text: string) => ChatMentionBody | undefined;
    /** Forgets the picks once a send has gone out — kept aside, in case its text comes back. */
    clearPicks: () => void;
    /** Puts back the picks the last `clearPicks` set aside, for a text that came back to the field unsent. */
    restoreClearedPicks: () => void;
}

/**
 * The composer's `@` lookup and the picks it makes.
 *
 * The picks are held here, in memory, and not in the persisted draft: leaving the room keeps the text
 * but forgets who its names meant, so a draft sent later mentions nobody. Keeping them in the draft
 * would mean persisting member ids beside every unsent text, for a case that is rare and harmless —
 * the message still goes, it just calls nobody.
 *
 * Reading the mention and forgetting the picks are two steps on purpose: a press does not always
 * send (no root yet in a thread, a caption whose photos were all refused), and the picks have to
 * outlive a press that sent nothing.
 */
export const useMentionComposer = ({
    enabled,
    candidates,
    content,
    setContent,
    inputRef,
    scope,
}: UseMentionComposerInput): MentionComposer => {
    const [query, setQuery] = useState<MentionQuery | null>(null);
    // Read at send time only, so a ref: a pick re-renders through the text it writes anyway.
    const picksRef = useRef<MentionPick[]>([]);
    // The picks of the last send, in case its text comes back to the field (a caption whose photos
    // were all refused).
    const clearedPicksRef = useRef<MentionPick[]>([]);
    // Where the caret goes once the field shows the text a pick wrote.
    const caretAfterPickRef = useRef<number | null>(null);

    useEffect(() => {
        picksRef.current = [];
        clearedPicksRef.current = [];
        setQuery(null);
    }, [scope]);

    // A cleared field — sent, or emptied by hand — leaves no name for a pick to belong to.
    useEffect(() => {
        if (content) return;
        picksRef.current = [];
        setQuery(null);
    }, [content]);

    // The list follows the caret, not only the typing: a tap or an arrow key moves the caret without a
    // change, and a list left on the old `@` would write its pick somewhere the user is no longer
    // looking. Leaving the field closes it.
    useEffect(() => {
        const field = inputRef.current;
        if (!enabled || !field) return;
        const follow = () => setQuery(findMentionQuery(field.value, field.selectionStart ?? field.value.length));
        const close = () => setQuery(null);
        field.addEventListener('click', follow);
        field.addEventListener('keyup', follow);
        field.addEventListener('blur', close);
        return () => {
            field.removeEventListener('click', follow);
            field.removeEventListener('keyup', follow);
            field.removeEventListener('blur', close);
        };
    }, [enabled, inputRef]);

    const onChange = useCallback(
        (value: string) => {
            setContent(value);
            if (!enabled) return;
            // The field hands over its value only; the caret is read off the element itself.
            const caret = inputRef.current?.selectionStart ?? value.length;
            setQuery(findMentionQuery(value, caret));
        },
        [enabled, inputRef, setContent]
    );

    const suggestions = useMemo(
        () => (enabled && query ? filterMentionCandidates(candidates, query.query) : []),
        [enabled, query, candidates]
    );

    const pick = useCallback(
        (candidate: MentionCandidate) => {
            if (!query) return;
            // Worked out again at the pick, from where the caret is now: the list was opened by an
            // earlier keystroke, and the `@` it was opened on may no longer be the one the caret is in.
            const caret = inputRef.current?.selectionStart ?? query.start + query.query.length + 1;
            const live = findMentionQuery(content, caret);
            if (!live) {
                setQuery(null);
                return;
            }
            const next = applyMentionPick(content, live, caret, candidate.label);
            picksRef.current = [
                ...picksRef.current,
                candidate.everyone
                    ? { label: candidate.label, everyone: true }
                    : { label: candidate.label, userId: candidate.id },
            ];
            caretAfterPickRef.current = next.caret;
            setContent(next.text);
            setQuery(null);
        },
        [content, query, inputRef, setContent]
    );

    const openList = useCallback(() => {
        const field = inputRef.current;
        if (!enabled || !field || field.disabled) return;
        // With the field not focused, its caret is wherever it was last left; the button means "at the
        // end of what I wrote", which is also where the keyboard opens the field.
        const caret = document.activeElement === field ? (field.selectionStart ?? content.length) : content.length;
        field.focus();
        const typing = findMentionQuery(content, caret);
        if (typing) {
            setQuery(typing);
            return;
        }
        // An `@` only opens a lookup at the start of a word, so it is written apart from what precedes it.
        const before = content.slice(0, caret);
        const lead = before && !/\s$/u.test(before) ? ' ' : '';
        const at = caret + lead.length;
        caretAfterPickRef.current = at + 1;
        setContent(`${before}${lead}@${content.slice(caret)}`);
        setQuery({ start: at, query: '' });
    }, [enabled, inputRef, content, setContent]);

    // The field is controlled, so the new text lands on the next render; the caret is placed before
    // that render is painted, or it shows for a frame at the end of the text and a long draft scrolls.
    useLayoutEffect(() => {
        const caret = caretAfterPickRef.current;
        if (caret === null) return;
        caretAfterPickRef.current = null;
        inputRef.current?.setSelectionRange(caret, caret);
    }, [content, inputRef]);

    const mentionFor = useCallback(
        (text: string) =>
            collectMention(
                text,
                picksRef.current,
                candidates.map(candidate => candidate.label)
            ),
        [candidates]
    );

    const clearPicks = useCallback(() => {
        clearedPicksRef.current = picksRef.current;
        picksRef.current = [];
        setQuery(null);
    }, []);

    const restoreClearedPicks = useCallback(() => {
        picksRef.current = [...clearedPicksRef.current, ...picksRef.current];
        clearedPicksRef.current = [];
    }, []);

    return { onChange, suggestions, pick, openList, mentionFor, clearPicks, restoreClearedPicks };
};
