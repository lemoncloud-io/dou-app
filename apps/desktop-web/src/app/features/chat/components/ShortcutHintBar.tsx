import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { cn } from '@chatic/ui-kit';

import { ALT_KEY as ALT, MOD_KEY as MOD, useMessageJumpStore } from '../../../shared';
import { useModifierHold } from '../hooks/useModifierHold';
import { useChannelHistoryStore } from '../stores/useChannelHistoryStore';

interface Hint {
    keys: string;
    label: string;
    idle?: boolean;
}

export const ShortcutHintBar = () => {
    const { t } = useTranslation();
    const held = useModifierHold();
    const isHome = useLocation().pathname === '/';
    const canGoBack = useChannelHistoryStore(s => s.back.length > 0);
    const canGoForward = useChannelHistoryStore(s => s.forward.length > 0);
    const hasJumpOrigin = useMessageJumpStore(s => s.origin !== null);

    if (!held) return null;

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
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-caption font-semibold text-foreground">
                        {hint.keys}
                    </kbd>
                    <span>{hint.label}</span>
                </span>
            ))}
        </div>
    );
};
