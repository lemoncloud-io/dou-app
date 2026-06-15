import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { $convertToMarkdownString } from '@lexical/markdown';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { $createParagraphNode, $getRoot, $getSelection, $isRangeSelection, type EditorState } from 'lexical';

import { cn } from '@chatic/lib/utils';

import { useComposerDraftStore } from '../../../shared';
import type { Mentionable } from './MentionAutocomplete';
import {
    COMPOSER_NODES,
    COMPOSER_THEME,
    COMPOSER_TRANSFORMERS,
    ChannelDraftPlugin,
    ComposerActions,
    ComposerToolbar,
    EditablePlugin,
    FormatShortcutsPlugin,
    MentionsPlugin,
    SubmitPlugin,
} from './editor';

interface ComposerProps {
    disabled: boolean;
    onSend: (content: string) => void;
    /** Channel the draft belongs to — preserves unsent text across switches. */
    channelId: string;
    /** Overrides the default "Message" placeholder (e.g. "Message #general"). */
    placeholder?: string;
    /** Roster for @-autocomplete; omit to disable (e.g. while members load). */
    mentionables?: Mentionable[];
}

const ComposerInner = ({ disabled, onSend, channelId, placeholder, mentionables = [] }: ComposerProps) => {
    const { t } = useTranslation();
    const [editor] = useLexicalComposerContext();
    const setDraft = useComposerDraftStore(s => s.setDraft);
    const clearDraft = useComposerDraftStore(s => s.clearDraft);
    // Derived from the draft the change handler just wrote — no second copy of
    // the fact; re-renders only on the empty↔non-empty flip.
    const hasText = useComposerDraftStore(s => (s.drafts[channelId] ?? '').trim().length > 0);
    const placeholderText = placeholder ?? t('chat.composer.placeholder');

    // Drafts persist as markdown — the store's existing format, so old drafts
    // load. Empty documents drop the entry instead of accumulating '' keys.
    const handleChange = useCallback(
        (state: EditorState) => {
            state.read(() => {
                const markdown = $convertToMarkdownString(COMPOSER_TRANSFORMERS, undefined, true);
                if (markdown.trim()) setDraft(channelId, markdown);
                else clearDraft(channelId);
            });
        },
        [channelId, setDraft, clearDraft]
    );

    const submit = useCallback(() => {
        const markdown = editor
            .getEditorState()
            .read(() => $convertToMarkdownString(COMPOSER_TRANSFORMERS, undefined, true))
            .trim();
        if (!markdown || disabled) return;
        onSend(markdown);
        // Clearing the document fires handleChange, which drops the draft.
        editor.update(() => {
            const root = $getRoot();
            root.clear();
            root.append($createParagraphNode());
            root.selectEnd();
            // Drop carried-over bold/italic so the next message starts plain.
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.setFormat(0);
        });
        editor.focus();
    }, [editor, disabled, onSend]);

    const insertEmoji = (emoji: string) => {
        editor.update(() => {
            ($getSelection() ?? $getRoot().selectEnd()).insertText(emoji);
        });
        editor.focus();
    };

    return (
        <div className="px-4 pb-4 pt-1">
            <div
                className={cn(
                    'border-hairline relative flex flex-col gap-1 rounded-xl border bg-elevated px-3 py-2 shadow-raised transition-colors ease-tactile',
                    'focus-within:ring-2 focus-within:ring-primary/40'
                )}
            >
                <ComposerToolbar disabled={disabled} />
                <div className="flex items-end gap-2">
                    <div className="relative flex-1">
                        <RichTextPlugin
                            contentEditable={
                                <ContentEditable
                                    aria-label={placeholderText}
                                    className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words bg-transparent py-2 text-body text-foreground outline-none"
                                />
                            }
                            placeholder={
                                <div className="pointer-events-none absolute left-0 top-2 text-body text-placeholder">
                                    {placeholderText}
                                </div>
                            }
                            ErrorBoundary={LexicalErrorBoundary}
                        />
                    </div>
                    <ComposerActions
                        disabled={disabled}
                        canSend={hasText && !disabled}
                        onEmoji={insertEmoji}
                        onSend={submit}
                    />
                </div>
            </div>
            <p className="mt-1 px-1 text-caption text-muted-foreground">{t('chat.composer.hint')}</p>
            <HistoryPlugin />
            <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
            <MarkdownShortcutPlugin transformers={COMPOSER_TRANSFORMERS} />
            <MentionsPlugin mentionables={mentionables} />
            <SubmitPlugin onSubmit={submit} />
            <FormatShortcutsPlugin />
            <EditablePlugin disabled={disabled} />
            <ChannelDraftPlugin channelId={channelId} />
        </div>
    );
};

/**
 * WYSIWYG message composer (Lexical). Formats apply live — Slack-style, no
 * visible markers — and serialize to the same markdown-lite dialect RichText
 * renders, so the wire format is unchanged. Typing markdown (e.g. **bold**)
 * also live-converts via the shortcut plugin.
 */
export const Composer = (props: ComposerProps) => (
    <LexicalComposer
        initialConfig={{
            namespace: 'chatic-composer',
            theme: COMPOSER_THEME,
            nodes: COMPOSER_NODES,
            editable: !props.disabled,
            onError: (error: Error) => console.error('[composer]', error),
        }}
    >
        <ComposerInner {...props} />
    </LexicalComposer>
);
