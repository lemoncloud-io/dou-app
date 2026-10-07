import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { $getRoot, $getSelection } from 'lexical';

import { Button } from '@chatic/ui-kit/components/ui/button';

import {
    $exportWireMarkdown,
    $importWireMarkdown,
    COMPOSER_NODES,
    COMPOSER_THEME,
    COMPOSER_TRANSFORMERS,
    ComposerAutoLinkPlugin,
    ComposerEmojiButton,
    ComposerToolbar,
    FormatShortcutsPlugin,
    MentionsPlugin,
    SubmitPlugin,
} from './editor';
import type { Mentionable } from './MentionAutocomplete';

interface MessageEditorProps {
    /** The message's wire string. Read once, when the editor opens — later changes do not reload it. */
    initialContent: string;
    /** Roster for @-autocomplete, and for turning the message's existing `@name` back into chips. */
    mentionables?: Mentionable[];
    /** Called with the new wire string, only when it is non-empty and differs from what opened. */
    onSave: (content: string) => void;
    onCancel: () => void;
}

const NO_MENTIONABLES: Mentionable[] = [];

const MessageEditorInner = ({
    initialContent,
    mentionables = NO_MENTIONABLES,
    onSave,
    onCancel,
}: MessageEditorProps) => {
    const { t } = useTranslation();
    const [editor] = useLexicalComposerContext();
    const hintId = useId();
    const containerRef = useRef<HTMLDivElement>(null);
    // What the document exports as right after it is loaded. Dirty means "differs from this", not
    // "differs from the stored string": the round trip may normalise a message that was written
    // elsewhere, and touching nothing must not offer a save or rewrite it.
    const baselineRef = useRef<string | null>(null);
    const openedWithRef = useRef(initialContent);
    // Read once with the content: chips are restored for whoever was on the roster at that moment.
    const rosterRef = useRef(mentionables);
    const [isDirty, setDirty] = useState(false);

    useEffect(() => {
        const unregister = editor.registerUpdateListener(({ editorState }) => {
            const baseline = baselineRef.current;
            if (baseline === null) return;
            const next = editorState.read($exportWireMarkdown).trim();
            setDirty(next !== '' && next !== baseline);
        });
        editor.update(() => {
            $importWireMarkdown(
                openedWithRef.current,
                rosterRef.current.map(person => person.name)
            );
            $getRoot().selectEnd();
            baselineRef.current = $exportWireMarkdown().trim();
        });
        // The node itself, as the composer does: editor.focus() places a selection and leaves DOM
        // focus to follow it. preventScroll because the scrollIntoView below frames the whole box.
        editor.getRootElement()?.focus({ preventScroll: true });
        // The row can sit under the composer; bring the buttons into view once.
        containerRef.current?.scrollIntoView({ block: 'nearest' });
        return unregister;
    }, [editor]);

    // Enter and the Save button share this so the two can never drift.
    const save = useCallback(() => {
        const next = editor.getEditorState().read($exportWireMarkdown).trim();
        if (!next || next === baselineRef.current) onCancel();
        else onSave(next);
    }, [editor, onSave, onCancel]);

    const insertEmoji = (emoji: string) => {
        editor.update(() => {
            ($getSelection() ?? $getRoot().selectEnd()).insertText(emoji);
        });
        editor.getRootElement()?.focus({ preventScroll: true });
    };

    return (
        <div
            ref={containerRef}
            className="flex flex-col gap-1.5"
            // Handled here so it works from the body, a toolbar button or Cancel alike, and marked
            // handled so the thread panel's own Escape-to-close leaves the panel open. A key an
            // overlay already took (the emoji picker's, the mention list's) arrives prevented, and
            // a portalled picker bubbles through the React tree without being inside this box.
            onKeyDown={event => {
                if (event.key !== 'Escape' || event.defaultPrevented) return;
                if (!containerRef.current?.contains(event.target as Node)) return;
                event.preventDefault();
                onCancel();
            }}
        >
            <div className="relative flex flex-col overflow-hidden rounded-xl border border-control-border bg-background transition-colors ease-tactile focus-within:border-focus-border focus-within:shadow-[0_0_0_0.5px_hsl(var(--focus-border))]">
                <div className="px-3 py-2">
                    <ComposerToolbar />
                </div>
                <div aria-hidden className="h-px w-full bg-input" />
                <RichTextPlugin
                    contentEditable={
                        <ContentEditable
                            aria-label={t('chat.edit')}
                            aria-describedby={hintId}
                            className="max-h-[min(50vh,24rem)] min-h-[34px] overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-3 py-2 text-body text-foreground outline-none"
                        />
                    }
                    placeholder={null}
                    ErrorBoundary={LexicalErrorBoundary}
                />
                <div className="flex items-center justify-between px-3 pb-2">
                    <ComposerEmojiButton onEmoji={insertEmoji} />
                    {/* Buttons and shortcuts both, deliberately. The shortcuts are faster once
                        known and the buttons are how you find out — and how you leave the editor
                        without taking your hand off the mouse. */}
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={onCancel} className="h-9 px-3 text-caption">
                            {t('common.cancel')}
                        </Button>
                        <Button size="sm" onClick={save} disabled={!isDirty} className="h-9 px-3 text-caption">
                            {t('chat.editSave')}
                        </Button>
                    </div>
                </div>
            </div>
            <span id={hintId} className="text-micro text-muted-foreground">
                {t('chat.editHint')}
            </span>
            <HistoryPlugin />
            <MarkdownShortcutPlugin transformers={COMPOSER_TRANSFORMERS} />
            <MentionsPlugin mentionables={mentionables} />
            <ComposerAutoLinkPlugin />
            <SubmitPlugin onSubmit={save} />
            <FormatShortcutsPlugin />
        </div>
    );
};

/**
 * The editor a message opens in: the composer's formatting, shortcuts and emoji picker around the
 * message's own text, at the width of the message column. It owns no attachments — the update API
 * takes text only.
 */
export const MessageEditor = (props: MessageEditorProps) => (
    <LexicalComposer
        initialConfig={{
            namespace: 'chatic-message-edit',
            theme: COMPOSER_THEME,
            nodes: COMPOSER_NODES,
            editable: true,
            onError: (error: Error) => console.error('[message-editor]', error),
        }}
    >
        <MessageEditorInner {...props} />
    </LexicalComposer>
);
