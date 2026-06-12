import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
const MOD = isMac ? '⌘' : 'Ctrl';

const Kbd = ({ children }: { children: ReactNode }) => (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        {children}
    </kbd>
);

const isTypingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

/**
 * Press "?" (or Mod+/) anywhere outside a text field to toggle a cheat sheet of
 * the app's keyboard shortcuts. Self-contained: owns its open state + listener.
 */
export const ShortcutsDialog = () => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return;
            if (e.key === '?' || (e.key === '/' && (e.metaKey || e.ctrlKey))) {
                e.preventDefault();
                setOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const rows: Array<{ keys: ReactNode; label: string }> = [
        { keys: <Kbd>{MOD} K</Kbd>, label: t('shortcuts.search') },
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
                    <Kbd>Enter</Kbd> / <Kbd>Shift Enter</Kbd>
                </>
            ),
            label: t('shortcuts.send'),
        },
        {
            keys: (
                <>
                    <Kbd>{MOD} B</Kbd> <Kbd>{MOD} I</Kbd> <Kbd>{MOD} ⇧ X</Kbd> <Kbd>{MOD} ⇧ C</Kbd>
                </>
            ),
            label: t('shortcuts.format'),
        },
        { keys: <Kbd>Esc</Kbd>, label: t('shortcuts.closePanel') },
        { keys: <Kbd>?</Kbd>, label: t('shortcuts.help') },
    ];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-sm">
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
