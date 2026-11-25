import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { $getRoot, $getSelection } from 'lexical';

import { Button } from '@chatic/ui-kit';

import {
    $exportMessage,
    $exportWireMarkdown,
    $importWireMarkdown,
    COMPOSER_NODES,
    COMPOSER_THEME,
    COMPOSER_TRANSFORMERS,
    CodeFencePastePlugin,
    CodeFenceShortcutPlugin,
    ComposerAutoLinkPlugin,
    ComposerEmojiButton,
    ComposerToolbar,
    FormatShortcutsPlugin,
    LinkGuardPlugin,
    MentionsPlugin,
    SubmitPlugin,
} from './editor';
import type { Mentionable } from './MentionAutocomplete';

export interface MessageEditorProps {
    initialContent: string;
    mentionables?: Mentionable[];
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
    const baselineRef = useRef<string | null>(null);
    const openedWithRef = useRef(initialContent);
    const rosterRef = useRef(mentionables);
    const [isDirty, setDirty] = useState(false);
    const pickable = useMemo(() => mentionables.filter(person => !person.everyone), [mentionables]);

    useEffect(() => {
        const unregister = editor.registerUpdateListener(({ editorState }) => {
            const baseline = baselineRef.current;
            if (baseline === null) return;
            const next = editorState.read($exportMessage);
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
        editor.getRootElement()?.focus({ preventScroll: true });
        containerRef.current?.scrollIntoView({ block: 'nearest' });
        return unregister;
    }, [editor]);

    const save = useCallback(() => {
        const next = editor.getEditorState().read($exportMessage);
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
            onKeyDown={event => {
                if (event.key !== 'Escape' || event.defaultPrevented) return;
                if (!containerRef.current?.contains(event.target as Node)) return;
                event.preventDefault();
                onCancel();
            }}
        >
            <div className="relative flex flex-col overflow-hidden rounded-xl border border-control-border bg-background transition-colors ease-tactile focus-within:border-focus-border focus-within:shadow-[0_0_0_1px_hsl(var(--focus-border))]">
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
            <CodeFenceShortcutPlugin />
            <CodeFencePastePlugin />
            <LinkGuardPlugin />
            <MentionsPlugin mentionables={pickable} />
            <ComposerAutoLinkPlugin />
            <SubmitPlugin onSubmit={save} />
            <FormatShortcutsPlugin />
        </div>
    );
};

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
