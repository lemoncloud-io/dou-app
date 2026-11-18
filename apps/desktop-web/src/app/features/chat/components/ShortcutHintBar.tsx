import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { cn } from '@chatic/ui-kit';

import { ALT_KEY as ALT, MOD_KEY as MOD, useMessageJumpStore } from '../../../shared';
import { useModifierHold } from '../hooks/useModifierHold';
import { useChannelHistoryStore } from '../stores/useChannelHistoryStore';

interface Hint {
    keys: string;
    label: string;
    /** Pressing it now would do nothing; drawn faded so the reader can tell. */
    idle?: boolean;
}

/**
 * Hold ⌘ (Ctrl elsewhere) or ⌥ (Alt) on its own and a line at the top of the window lists what that
 * key starts. Releasing it, or pressing anything, takes the line away.
 *
 * One line rather than a badge on each control, because most of these chords have no control to
 * badge: the clouds a digit picks sit inside a closed menu, and Back and Forward have no button. The
 * line names each chord once, and ⌘/ opens the full sheet for the rest.
 *
 * A chord that would do nothing reads faded. Back and Forward fade on home when there is nowhere to
 * step to; on other pages Back always goes somewhere (the previous page, or home) and the browser
 * does not say whether a Forward page exists, so neither fades there. The chords only home binds
 * fade everywhere else.
 */
export const ShortcutHintBar = () => {
    const { t } = useTranslation();
    const held = useModifierHold();
    const isHome = useLocation().pathname === '/';
    const canGoBack = useChannelHistoryStore(s => s.back.length > 0);
    const canGoForward = useChannelHistoryStore(s => s.forward.length > 0);
    // A jump's way back counts as Back on home even when it recorded no room of its own.
    const hasJumpOrigin = useMessageJumpStore(s => s.origin !== null);

    if (!held) return null;

    // The switcher, search, the rail and the unread chord are bound by home's own components, so on
    // Settings or a profile they do nothing.
    const offHome = !isHome;
    const hints: Hint[] =
        held === 'mod'
            ? [
                  { keys: `${MOD} K`, label: t('shortcutHints.switcher'), idle: offHome },
                  { keys: `${MOD} ⇧ F`, label: t('shortcutHints.messageSearch'), idle: offHome },
                  { keys: `${MOD} 0–9`, label: t('shortcutHints.cloud'), idle: offHome },
                  { keys: `${MOD} [`, label: t('shortcutHints.back'), idle: isHome && !canGoBack && !hasJumpOrigin },
                  { keys: `${MOD} ]`, label: t('shortcutHints.forward'), idle: isHome && !canGoForward },
                  { keys: `${MOD} /`, label: t('shortcutHints.all') },
              ]
            : [{ keys: `${ALT} ⇧ ↑ ↓`, label: t('shortcutHints.unread'), idle: offHome }];

    return (
        // Shown only while a key is held and gone on the next one, so a screen reader would hear it
        // as noise; the shortcut sheet (⌘/) is where the same list is read.
        <div
            aria-hidden
            data-testid="shortcut-hint-bar"
            className="pointer-events-none fixed left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full border border-border bg-popover px-4 py-1.5 text-caption text-popover-foreground shadow-md"
        >
            {hints.map(hint => (
                <span
                    key={hint.keys}
                    data-idle={hint.idle || undefined}
                    className={cn('flex shrink-0 items-center gap-1.5', hint.idle && 'opacity-40')}
                >
                    {/* Larger than the sheet's keys: this line is read at a glance, and ⌘ and ⇧ blur small. */}
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-caption font-semibold text-foreground">
                        {hint.keys}
                    </kbd>
                    <span>{hint.label}</span>
                </span>
            ))}
        </div>
    );
};
