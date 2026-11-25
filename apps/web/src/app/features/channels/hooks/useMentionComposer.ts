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

import type { ChatMentionBody } from '@chatic/runtime-react';

import {
    applyMentionPick,
    collectMention,
    filterMentionCandidates,
    findMentionQuery,
    removeWholeMention,
    type MentionCandidate,
    type MentionPick,
    type MentionQuery,
} from '../utils/mentionInput';

interface UseMentionComposerInput {
    enabled: boolean;
    candidates: readonly MentionCandidate[];
    content: string;
    setContent: Dispatch<SetStateAction<string>>;
    inputRef: RefObject<HTMLTextAreaElement | null>;
    scope: string;
}

export interface MentionComposer {
    onChange: (value: string) => void;
    suggestions: MentionCandidate[];
    pick: (candidate: MentionCandidate) => void;
    mentionFor: (text: string) => ChatMentionBody | undefined;
    clearPicks: () => void;
    restoreClearedPicks: () => void;
}

export const useMentionComposer = ({
    enabled,
    candidates,
    content,
    setContent,
    inputRef,
    scope,
}: UseMentionComposerInput): MentionComposer => {
    const [query, setQuery] = useState<MentionQuery | null>(null);
    const picksRef = useRef<MentionPick[]>([]);
    const clearedPicksRef = useRef<MentionPick[]>([]);
    const caretAfterPickRef = useRef<number | null>(null);

    useEffect(() => {
        picksRef.current = [];
        clearedPicksRef.current = [];
        setQuery(null);
    }, [scope]);

    useEffect(() => {
        if (content) return;
        picksRef.current = [];
        setQuery(null);
    }, [content]);

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
            if (enabled) {
                const whole = removeWholeMention(
                    content,
                    value,
                    picksRef.current.map(pick => pick.label),
                    candidates.map(candidate => candidate.label)
                );
                if (whole) {
                    const index = picksRef.current.findIndex(pick => pick.label === whole.label);
                    picksRef.current = picksRef.current.filter((_, position) => position !== index);
                    caretAfterPickRef.current = whole.caret;
                    setContent(whole.text);
                    setQuery(null);
                    return;
                }
            }
            setContent(value);
            if (!enabled) return;
            const caret = inputRef.current?.selectionStart ?? value.length;
            setQuery(findMentionQuery(value, caret));
        },
        [enabled, content, candidates, inputRef, setContent]
    );

    const suggestions = useMemo(
        () => (enabled && query ? filterMentionCandidates(candidates, query.query) : []),
        [enabled, query, candidates]
    );

    const pick = useCallback(
        (candidate: MentionCandidate) => {
            if (!query) return;
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

    return { onChange, suggestions, pick, mentionFor, clearPicks, restoreClearedPicks };
};
