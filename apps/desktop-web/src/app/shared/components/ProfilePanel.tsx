import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { usePanelWidth } from '../hooks/usePanelWidth';
import { Hint } from './Hint';
import { PanelResizeHandle } from './PanelResizeHandle';
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
    const resize = usePanelWidth({
        storageKey: 'chatic.profilePanel.width',
        defaultWidth: 320,
    });

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
        <aside
            ref={resize.panelRef}
            style={{ width: resize.width }}
            className="absolute inset-y-0 right-0 z-30 flex max-w-[85vw] shrink-0 flex-col overflow-hidden border-l border-hairline bg-elevated shadow-raised xl:relative xl:z-auto xl:max-w-none xl:shadow-none"
        >
            <PanelResizeHandle label={t('profile.panel.resize')} panel={resize} />
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
        </aside>
    );
};
