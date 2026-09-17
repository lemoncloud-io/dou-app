import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { ALT_KEY as ALT, MOD_KEY as MOD } from '../../../shared';
import { useShortcutsDialogStore } from '../stores';
import { isTypingTarget } from '../utils';

const Kbd = ({ children }: { children: ReactNode }) => (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-tiny font-medium text-muted-foreground">
        {children}
    </kbd>
);

/**
 * Press "?" (or Mod+/) anywhere outside a text field to toggle a cheat sheet of
 * the app's keyboard shortcuts; Settings opens it too. Mounted once at
 * the router, so it works on /settings and /profile — it used to live on the
 * home route only, where the key did nothing anywhere else.
 */
export const ShortcutsDialog = () => {
    const { t } = useTranslation();
    const open = useShortcutsDialogStore(s => s.isOpen);
    const setOpen = useShortcutsDialogStore(s => s.setOpen);
    const toggle = useShortcutsDialogStore(s => s.toggle);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return;
            if (e.key === '?' || (e.key === '/' && (e.metaKey || e.ctrlKey))) {
                e.preventDefault();
                toggle();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [toggle]);

    const rows: Array<{ keys: ReactNode; label: string }> = [
        { keys: <Kbd>{MOD} K</Kbd>, label: t('shortcuts.search') },
        { keys: <Kbd>{MOD} ⇧ F</Kbd>, label: t('shortcuts.messageSearch') },
        {
            keys: (
                <>
                    <Kbd>↑</Kbd> <Kbd>↓</Kbd>
                </>
            ),
            label: t('shortcuts.navigate'),
        },
        {
            keys: (
                <>
                    <Kbd>{ALT} ⇧ ↑</Kbd> <Kbd>{ALT} ⇧ ↓</Kbd>
                </>
            ),
            label: t('shortcuts.moveChannel'),
        },
        {
            keys: (
                <>
                    <Kbd>Enter</Kbd> / <Kbd>Shift Enter</Kbd>
                </>
            ),
            label: t('shortcuts.send'),
        },
        { keys: <Kbd>A–Z</Kbd>, label: t('shortcuts.typeToCompose') },
        {
            keys: (
                <>
                    <Kbd>{MOD} B</Kbd> <Kbd>{MOD} I</Kbd> <Kbd>{MOD} ⇧ X</Kbd> <Kbd>{MOD} ⇧ C</Kbd>{' '}
                    <Kbd>{MOD} ⇧ ⌥ C</Kbd>
                </>
            ),
            label: t('shortcuts.format'),
        },
        { keys: <Kbd>Esc</Kbd>, label: t('shortcuts.closePanel') },
        {
            keys: (
                <>
                    <Kbd>?</Kbd> <Kbd>{MOD} /</Kbd>
                </>
            ),
            label: t('shortcuts.help'),
        },
    ];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-sm">
                <DialogTitle>{t('shortcuts.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('shortcuts.title')}</DialogDescription>
                <ul className="flex flex-col gap-2 pt-2">
                    {rows.map(row => (
                        <li key={row.label} className="flex items-center justify-between gap-4">
                            <span className="text-sm text-foreground">{row.label}</span>
                            <span className="flex shrink-0 items-center gap-1 text-muted-foreground">{row.keys}</span>
                        </li>
                    ))}
                </ul>
            </DialogContent>
        </Dialog>
    );
};
