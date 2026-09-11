import { useCallback, useEffect } from 'react';
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
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { useComposerDraftStore } from '../../../shared';
import type { ComposerAttachment } from '../hooks';
import { shouldCaptureTyping } from '../utils';
import type { Mentionable } from './MentionAutocomplete';
import { AttachMenu, ComposerAttachments } from './images';
import {
    COMPOSER_NODES,
    COMPOSER_THEME,
    COMPOSER_TRANSFORMERS,
    ChannelDraftPlugin,
    ComposerActions,
    ComposerToolbar,
    FormatShortcutsPlugin,
    MentionsPlugin,
    SubmitPlugin,
} from './editor';

interface ComposerProps {
    onSend: (content: string) => void;
    /** Channel the draft belongs to — preserves unsent text across switches. */
    channelId: string;
    /** Overrides the default "Message" placeholder (e.g. "Message #general"). */
    placeholder?: string;
    /** Roster for @-autocomplete; omit to disable (e.g. while members load). */
    mentionables?: Mentionable[];
    /** Image tray. Omit all three to hide the "+" and ignore pasted files. */
    attachments?: ComposerAttachment[];
    onAddFiles?: (files: File[]) => void;
    onRemoveAttachment?: (id: string) => void;
    /**
     * Take printable keys typed while nothing else holds focus (Slack's type-to-compose).
     * One composer per window should claim this — the channel's, not the thread's.
     */
    capturesTyping?: boolean;
}

const ComposerInner = ({
    onSend,
    channelId,
    placeholder,
    mentionables = [],
    attachments = [],
    onAddFiles,
    onRemoveAttachment,
    capturesTyping,
}: ComposerProps) => {
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
        if (!markdown && attachments.length === 0) return;
        // No upload API on the server yet: refuse the whole send rather than drop the
        // images silently or post their text without them. The text and the tray stay.
        if (attachments.length > 0) {
            toast({ description: t('chat.attach.unavailable') });
            return;
        }
        onSend(markdown);
        // Clearing the document fires handleChange, which drops the draft.
        editor.update(
            () => {
                const root = $getRoot();
                root.clear();
                root.append($createParagraphNode());
                root.selectEnd();
                // Drop carried-over bold/italic so the next message starts plain.
                const selection = $getSelection();
                if ($isRangeSelection(selection)) selection.setFormat(0);
            },
            // Re-focus AFTER the cleared document commits to the DOM — calling
            // focus() synchronously (before the reconcile) leaves the caret
            // inactive. defaultSelection keeps the caret at the end so the user
            // can keep typing without re-clicking the input.
            { onUpdate: () => editor.focus(undefined, { defaultSelection: 'rootEnd' }) }
        );
    }, [editor, onSend, attachments, t]);

    // Focusing during keydown hands the same keystroke to the editor, so the first letter
    // lands in the message instead of being lost.
    useEffect(() => {
        if (!capturesTyping) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (shouldCaptureTyping(event)) editor.focus();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [capturesTyping, editor]);

    const insertEmoji = (emoji: string) => {
        editor.update(() => {
            ($getSelection() ?? $getRoot().selectEnd()).insertText(emoji);
        });
        editor.focus();
    };

    return (
        <div
            className="bg-background/[0.92] px-6 pb-5 pt-2 backdrop-blur-[8px]"
            // Pasted images join the tray; pasted text still goes to the editor untouched.
            onPasteCapture={event => {
                if (!onAddFiles) return;
                const files = Array.from(event.clipboardData.files);
                if (files.length === 0) return;
                event.preventDefault();
                event.stopPropagation();
                onAddFiles(files);
            }}
        >
            <div
                className={cn(
                    'relative flex flex-col overflow-hidden rounded-2xl border border-input bg-background transition-colors ease-tactile',
                    // Figma "#이미지 전송 전": the box turns GR2 lime while you are in it.
                    'focus-within:border-focus-border focus-within:shadow-[0_0_0_0.5px_hsl(var(--focus-border))]'
                )}
            >
                <div className="flex items-center gap-2 px-5 py-3">
                    {onAddFiles && <AttachMenu onFiles={onAddFiles} />}
                    <ComposerToolbar />
                    {/* The newline key is the one thing people get wrong in a chat box; say it
                        while it matters (there is text) and stay out of the way otherwise. */}
                    {hasText && (
                        <span className="ml-auto hidden text-[12px] text-placeholder animate-fade-in sm:block">
                            {t('chat.composer.newlineHint')}
                        </span>
                    )}
                </div>
                <div aria-hidden className="h-px w-full bg-input" />
                <div className="flex items-end gap-6 px-5 py-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-4">
                        <div className="relative">
                            <RichTextPlugin
                                contentEditable={
                                    <ContentEditable
                                        aria-label={placeholderText}
                                        className="max-h-40 min-h-[34px] overflow-y-auto whitespace-pre-wrap break-words bg-transparent py-1.5 text-body text-foreground outline-none"
                                    />
                                }
                                placeholder={
                                    <div className="pointer-events-none absolute left-0 top-1.5 text-body text-placeholder">
                                        {placeholderText}
                                    </div>
                                }
                                ErrorBoundary={LexicalErrorBoundary}
                            />
                        </div>
                        {onRemoveAttachment && (
                            <ComposerAttachments attachments={attachments} onRemove={onRemoveAttachment} />
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                        <ComposerActions
                            canSend={hasText || attachments.length > 0}
                            onEmoji={insertEmoji}
                            onSend={submit}
                        />
                    </div>
                </div>
            </div>
            <HistoryPlugin />
            <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
            <MarkdownShortcutPlugin transformers={COMPOSER_TRANSFORMERS} />
            <MentionsPlugin mentionables={mentionables} />
            <SubmitPlugin onSubmit={submit} />
            <FormatShortcutsPlugin />
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
            // Always editable — sending never makes the input non-editable, so the
            // caret stays put (Slack-style continuous focus). Sends aren't gated on
            // each other either: the optimistic insert gives instant feedback.
            editable: true,
            onError: (error: Error) => console.error('[composer]', error),
        }}
    >
        <ComposerInner {...props} />
    </LexicalComposer>
);
