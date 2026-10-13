import { type FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
    $createTextNode,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $setSelection,
    type BaseSelection,
} from 'lexical';
import { Link } from 'lucide-react';

import { Input } from '@chatic/ui-kit/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';

import { Hint, LINK_URL_SOURCE } from '../../../../shared';

const WHOLE_URL = new RegExp(`^${LINK_URL_SOURCE}$`);

/** The address as it will be sent, or null when it cannot be one: a bare `example.com` gets https. */
export const normalizeLinkAddress = (raw: string): string | null => {
    const value = raw.trim();
    // `://`, not any `word:` — `localhost:3000` is a host and a port, not a scheme.
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    return value && WHOLE_URL.test(url) ? url : null;
};

/**
 * Slack's link button, cut to what a message can carry. Messages have no link-with-label form —
 * a link is its URL, which every client turns into a link when it reads one — so this asks for
 * the address only and writes it at the caret, after the selected words if there are any, rather
 * than hiding it behind them. The autolink plugin then marks it as a link, as if it was typed.
 */
export const LinkButton = ({ className }: { className: string }) => {
    const { t } = useTranslation();
    const [editor] = useLexicalComposerContext();
    const [isOpen, setOpen] = useState(false);
    const [address, setAddress] = useState('');
    // Focus moves to the field while the popover is open, so the caret it was opened from is
    // kept here and put back before the link goes in.
    const savedSelection = useRef<BaseSelection | null>(null);

    const open = (next: boolean) => {
        if (next) {
            savedSelection.current = editor.getEditorState().read(() => $getSelection()?.clone() ?? null);
            setAddress('');
        }
        setOpen(next);
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const url = normalizeLinkAddress(address);
        if (!url) return;
        editor.update(() => {
            if (savedSelection.current) $setSelection(savedSelection.current.clone());
            const selection = $getSelection();
            const target = $isRangeSelection(selection) ? selection : $getRoot().selectEnd();
            if (!target.isCollapsed()) {
                const end = target.isBackward() ? target.anchor : target.focus;
                target.anchor.set(end.key, end.offset, end.type);
                target.focus.set(end.key, end.offset, end.type);
            }
            // A text anchor's offset counts characters; an element anchor's counts children, so
            // there the text before the caret is whatever the child ahead of it ends with.
            const { anchor } = target;
            const before =
                anchor.type === 'text'
                    ? anchor.getNode().getTextContent().slice(0, anchor.offset)
                    : (anchor
                          .getNode()
                          .getChildAtIndex?.(anchor.offset - 1)
                          ?.getTextContent() ?? '');
            target.insertNodes([$createTextNode(`${before && !/\s$/.test(before) ? ' ' : ''}${url} `)]);
        });
        setOpen(false);
    };

    return (
        <Popover open={isOpen} onOpenChange={open}>
            <PopoverTrigger asChild>
                <Hint label={t('chat.composer.format.link')}>
                    <button
                        type="button"
                        aria-label={t('chat.composer.format.link')}
                        onMouseDown={e => e.preventDefault()}
                        className={className}
                    >
                        <Link size={16} strokeWidth={2} aria-hidden />
                    </button>
                </Hint>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                side="top"
                className="w-80 p-3"
                onCloseAutoFocus={event => {
                    // Back to the text, where the link just went (or would have gone).
                    event.preventDefault();
                    editor.focus();
                }}
            >
                <form onSubmit={submit} className="flex items-center gap-2">
                    <Input
                        autoFocus
                        value={address}
                        onChange={event => setAddress(event.target.value)}
                        aria-label={t('chat.composer.link.address')}
                        aria-invalid={address.trim() !== '' && !normalizeLinkAddress(address)}
                        placeholder={t('chat.composer.link.placeholder')}
                        className="h-9 p-2 text-body"
                    />
                    <button
                        type="submit"
                        disabled={!normalizeLinkAddress(address)}
                        className="focus-ring tactile h-9 shrink-0 rounded-md bg-primary px-3 text-caption text-primary-foreground transition-opacity ease-tactile disabled:opacity-50"
                    >
                        {t('chat.composer.link.add')}
                    </button>
                </form>
            </PopoverContent>
        </Popover>
    );
};
