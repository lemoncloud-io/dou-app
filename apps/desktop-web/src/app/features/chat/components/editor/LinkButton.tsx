import { type FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { $createLinkNode, $isAutoLinkNode, $isLinkNode, type LinkNode } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $findMatchingParent } from '@lexical/utils';
import {
    $createTextNode,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $setSelection,
    type BaseSelection,
} from 'lexical';
import { Link } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';

import { Hint, isLabelledLinkAddress, toLabelledLinkWords } from '../../../../shared';

/**
 * The address as it will be sent, or null when it cannot be one. A bare `example.com` gets https,
 * and parentheses are percent-encoded (the same address to a browser) because a labelled link's
 * address cannot hold them.
 */
export const normalizeLinkAddress = (raw: string): string | null => {
    const value = raw.trim();
    // `://`, not any `word:` — `localhost:3000` is a host and a port, not a scheme.
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    const url = withScheme.replace(/\(/g, '%28').replace(/\)/g, '%29');
    return value && isLabelledLinkAddress(url) ? url : null;
};

/** The labelled link the caret sits in, if any — an autolinked bare URL is not one. */
export const $selectedLink = (): LinkNode | null => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    const link = $findMatchingParent(selection.anchor.getNode(), $isLinkNode);
    return link && !$isAutoLinkNode(link) ? link : null;
};

/**
 * Slack's link button: a dialog with the words to show and the address they go to. The words
 * start as the selection (or the link the caret is in, which is then edited in place), and Save
 * puts them back as a link. With no words the address goes in bare, as if it had been typed, and
 * the autolink plugin marks it. A message carries the link as `[words](address)`.
 */
export const LinkButton = ({ className, isActive = false }: { className: string; isActive?: boolean }) => {
    const { t } = useTranslation();
    const [editor] = useLexicalComposerContext();
    const [isOpen, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [address, setAddress] = useState('');
    // Focus moves into the dialog, so the selection it was opened from is kept here and put
    // back before the link goes in.
    const savedSelection = useRef<BaseSelection | null>(null);
    const url = normalizeLinkAddress(address);

    const open = () => {
        editor.getEditorState().read(() => {
            const selection = $getSelection();
            savedSelection.current = selection?.clone() ?? null;
            const link = $selectedLink();
            setText(link ? link.getTextContent() : (selection?.getTextContent() ?? ''));
            setAddress(link ? link.getURL() : '');
        });
        setOpen(true);
    };

    const save = (event: FormEvent) => {
        event.preventDefault();
        if (!url) return;
        const words = toLabelledLinkWords(text).trim();
        editor.update(() => {
            if (savedSelection.current) $setSelection(savedSelection.current.clone());
            const existing = $selectedLink();
            const replacement = words ? $createLinkNode(url).append($createTextNode(words)) : $createTextNode(url);
            if (existing) {
                existing.replace(replacement);
                replacement.selectEnd();
                return;
            }
            const selection = $getSelection();
            ($isRangeSelection(selection) ? selection : $getRoot().selectEnd()).insertNodes([replacement]);
        });
        setOpen(false);
    };

    return (
        <>
            <Hint label={t('chat.composer.format.link')}>
                <button
                    type="button"
                    aria-label={t('chat.composer.format.link')}
                    aria-pressed={isActive}
                    onMouseDown={e => e.preventDefault()}
                    onClick={open}
                    className={className}
                >
                    <Link size={16} strokeWidth={2} aria-hidden />
                </button>
            </Hint>
            <Dialog open={isOpen} onOpenChange={setOpen}>
                <DialogContent
                    closeLabel={t('common.close')}
                    aria-describedby={undefined}
                    className="sm:max-w-md"
                    onCloseAutoFocus={event => {
                        // Back to the text, where the link just went (or would have gone).
                        event.preventDefault();
                        editor.focus();
                    }}
                >
                    <DialogTitle>{t('chat.composer.link.title')}</DialogTitle>
                    <form onSubmit={save} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="composer-link-text">{t('chat.composer.link.text')}</Label>
                            <Input
                                id="composer-link-text"
                                autoFocus={!text}
                                value={text}
                                onChange={event => setText(event.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="composer-link-address">{t('chat.composer.link.address')}</Label>
                            <Input
                                id="composer-link-address"
                                autoFocus={!!text}
                                value={address}
                                onChange={event => setAddress(event.target.value)}
                                aria-invalid={address.trim() !== '' && !url}
                                placeholder={t('chat.composer.link.placeholder')}
                            />
                        </div>
                        <DialogFooter className="gap-2 sm:space-x-0">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={!url}>
                                {t('chat.composer.link.save')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
};
