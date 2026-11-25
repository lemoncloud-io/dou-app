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

import { Button, Dialog, DialogContent, DialogFooter, DialogTitle, Input, Label } from '@chatic/ui-kit';

import { Hint, isLabelledLinkAddress, toLabelledLinkWords } from '../../../../shared';

export const normalizeLinkAddress = (raw: string): string | null => {
    const value = raw.trim();
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    const url = withScheme.replace(/\(/g, '%28').replace(/\)/g, '%29');
    return value && isLabelledLinkAddress(url) ? url : null;
};

export const $selectedLink = (): LinkNode | null => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    const link = $findMatchingParent(selection.anchor.getNode(), $isLinkNode);
    return link && !$isAutoLinkNode(link) ? link : null;
};

export const LinkButton = ({ className, isActive = false }: { className: string; isActive?: boolean }) => {
    const { t } = useTranslation();
    const [editor] = useLexicalComposerContext();
    const [isOpen, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [address, setAddress] = useState('');
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
