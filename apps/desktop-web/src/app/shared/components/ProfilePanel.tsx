import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { Hint } from './Hint';
import { ResizablePanel } from './ResizablePanel';
import { useProfilePanelStore } from '../stores/useProfilePanelStore';
import { ProfileCardContent } from './ProfileCard';

/**
 * Slack-style right-side profile pane. Visibility is driven by
 * useProfilePanelStore.target; the host (HomePage) renders this only when set
 * and keeps it mutually exclusive with the thread/settings panes. Reuses the
 * popover's ProfileCardContent as its body so both surfaces resolve and render
 * one identity.
 */
export const ProfilePanel = () => {
    const { t } = useTranslation();
    const target = useProfilePanelStore(s => s.target);
    const close = useProfilePanelStore(s => s.close);

    // Esc closes the panel (matches the settings panel / dialogs elsewhere).
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [close]);

    if (!target) return null;

    return (
        <ResizablePanel
            storageKey={'chatic.profilePanel.width'}
            defaultWidth={320}
            resizeLabel={t('profile.panel.resize')}
            className="bg-elevated"
        >
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-4">
                <span className="truncate text-title text-foreground">{t('profile.panel.title')}</span>
                <Hint label={t('profile.panel.close')}>
                    <button
                        type="button"
                        onClick={close}
                        aria-label={t('profile.panel.close')}
                        className="focus-ring tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                    >
                        <X size={18} />
                    </button>
                </Hint>
            </header>
            <div className="scrollbar-thin flex-1 overflow-y-auto">
                {/* Remount per user so copy state / user subscription reset on target switch. */}
                <ProfileCardContent key={target.userId} {...target} />
            </div>
        </ResizablePanel>
    );
};
