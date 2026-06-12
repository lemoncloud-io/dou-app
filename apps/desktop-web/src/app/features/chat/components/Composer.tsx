import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Bold, Code, Italic, SendHorizontal, Smile, SquareCode, Strikethrough } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';

import { useComposerDraftStore } from '../../../shared';
import { EmojiPicker } from './EmojiPicker';
import {
    MentionAutocomplete,
    useMentionAutocomplete,
    type MentionToken,
    type Mentionable,
} from './MentionAutocomplete';

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

const MAX_HEIGHT = 160;

// Formatting toolbar — markers match what RichText renders. Keyboard
// equivalents live in handleKeyDown (⌘B/⌘I/⌘⇧X/⌘⇧C/⌘⇧⌥C, Slack's bindings).
const FORMATS = [
    { key: 'bold', icon: Bold, prefix: '**' },
    { key: 'italic', icon: Italic, prefix: '*' },
    { key: 'strike', icon: Strikethrough, prefix: '~~' },
    { key: 'code', icon: Code, prefix: '`' },
    { key: 'codeBlock', icon: SquareCode, prefix: '```\n', suffix: '\n```' },
] as const;

export const Composer = ({ disabled, onSend, channelId, placeholder, mentionables = [] }: ComposerProps) => {
    const { t } = useTranslation();
    const [value, setValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const setDraft = useComposerDraftStore(s => s.setDraft);
    const clearDraft = useComposerDraftStore(s => s.clearDraft);
    const placeholderText = placeholder ?? t('chat.composer.placeholder');

    const applyMention = (token: MentionToken, picked: Mentionable) => {
        const insert = `@${picked.name} `;
        handleChange(value.slice(0, token.start) + insert + value.slice(token.end));
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            const pos = token.start + insert.length;
            el?.focus();
            el?.setSelectionRange(pos, pos);
            resize();
        });
    };
    const mention = useMentionAutocomplete({ mentionables, onApply: applyMention });

    const resize = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    };

    // Load this channel's saved draft on switch (read once — no subscription),
    // then focus so you can type immediately.
    useEffect(() => {
        setValue(useComposerDraftStore.getState().drafts[channelId] ?? '');
        const raf = requestAnimationFrame(() => {
            resize();
            textareaRef.current?.focus();
        });
        return () => cancelAnimationFrame(raf);
    }, [channelId]);

    const handleChange = (next: string) => {
        setValue(next);
        setDraft(channelId, next);
        resize();
    };

    const submit = () => {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;
        onSend(trimmed);
        setValue('');
        clearDraft(channelId);
        requestAnimationFrame(() => {
            resize();
            textareaRef.current?.focus();
        });
    };

    // Wrap the selection in formatting markers (Slack-style ⌘B/⌘I/…). The
    // selection is restored shifted by the opening marker, so repeating the
    // shortcut keeps wrapping the same text.
    const wrapSelection = (prefix: string, suffix: string = prefix) => {
        const el = textareaRef.current;
        if (!el) return;
        const { selectionStart: start, selectionEnd: end } = el;
        handleChange(value.slice(0, start) + prefix + value.slice(start, end) + suffix + value.slice(end));
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(start + prefix.length, end + prefix.length);
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Autocomplete owns navigation keys while it's open (Enter picks, not sends).
        if (mention.handleKeyDown(e)) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
            return;
        }
        if (!(e.metaKey || e.ctrlKey)) return;
        if (e.altKey) {
            // ⌘⇧⌥C — code block. e.code (not e.key): macOS Option remaps e.key.
            if (e.shiftKey && e.code === 'KeyC') {
                e.preventDefault();
                wrapSelection('```\n', '\n```');
            }
            return;
        }
        const markers: Record<string, string> = e.shiftKey ? { x: '~~', c: '`' } : { b: '**', i: '*' };
        const marker = markers[e.key.toLowerCase()];
        if (!marker) return;
        e.preventDefault();
        wrapSelection(marker);
    };

    const insertEmoji = (emoji: string) => {
        const el = textareaRef.current;
        const start = el?.selectionStart ?? value.length;
        const end = el?.selectionEnd ?? value.length;
        const next = value.slice(0, start) + emoji + value.slice(end);
        handleChange(next);
        requestAnimationFrame(() => {
            const pos = start + emoji.length;
            el?.focus();
            el?.setSelectionRange(pos, pos);
            resize();
        });
    };

    const canSend = value.trim().length > 0 && !disabled;

    return (
        <div className="px-4 pb-4 pt-1">
            <div
                className={cn(
                    'border-hairline relative flex flex-col gap-1 rounded-xl border bg-elevated px-3 py-2 shadow-raised transition-colors ease-tactile',
                    'focus-within:ring-2 focus-within:ring-primary/40'
                )}
            >
                {mention.open && (
                    <MentionAutocomplete
                        items={mention.items}
                        activeIndex={mention.activeIndex}
                        onSelect={mention.select}
                    />
                )}
                <div className="flex items-center gap-0.5" role="toolbar" aria-label={t('chat.composer.formatting')}>
                    {FORMATS.map(({ key, icon: Icon, prefix, ...rest }) => (
                        <button
                            key={key}
                            type="button"
                            disabled={disabled}
                            title={t(`chat.composer.format.${key}`)}
                            aria-label={t(`chat.composer.format.${key}`)}
                            // mousedown (not click) so the textarea keeps focus + selection.
                            onMouseDown={e => {
                                e.preventDefault();
                                wrapSelection(prefix, 'suffix' in rest ? rest.suffix : prefix);
                            }}
                            className="focus-ring tactile flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                            <Icon className="h-3.5 w-3.5" aria-hidden />
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={value}
                        onChange={e => {
                            handleChange(e.target.value);
                            mention.sync(e.target.value, e.target.selectionStart ?? e.target.value.length);
                        }}
                        onClick={e => mention.sync(value, e.currentTarget.selectionStart ?? value.length)}
                        onBlur={mention.close}
                        onKeyDown={handleKeyDown}
                        aria-label={placeholderText}
                        placeholder={placeholderText}
                        className="max-h-40 flex-1 resize-none bg-transparent text-body text-foreground outline-none placeholder:text-placeholder"
                    />
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                disabled={disabled}
                                title={t('chat.composer.emoji')}
                                aria-label={t('chat.composer.emoji')}
                                className="focus-ring tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground disabled:opacity-50"
                            >
                                <Smile className="h-5 w-5" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" side="top" className="w-auto p-2">
                            <EmojiPicker onPick={insertEmoji} />
                        </PopoverContent>
                    </Popover>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!canSend}
                        title={t('chat.composer.send')}
                        className={cn(
                            'focus-ring tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all ease-tactile',
                            canSend
                                ? 'bg-primary text-primary-foreground hover:opacity-90'
                                : 'bg-muted text-muted-foreground'
                        )}
                    >
                        <SendHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                </div>
            </div>
            <p className="mt-1 px-1 text-caption text-muted-foreground">{t('chat.composer.hint')}</p>
        </div>
    );
};
