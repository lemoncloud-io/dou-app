import { useI18n } from '../i18n';
import type { VirtualShell } from '../shell/VirtualShell';

/** Pushes that arrived while the app was away — where a phone's notification centre would hold them. */
export const NotificationCentre = ({ shell }: { shell: VirtualShell }) => {
    const { t } = useI18n();
    return (
        <div className="vs-cards">
            <p className="vs-hint">{t('notif.desc')}</p>
            {!shell.notifications.length && <p className="vs-empty">{t('notif.empty')}</p>}
            {shell.notifications.map(card => (
                <button
                    key={card.id}
                    type="button"
                    className="vs-banner vs-banner-button"
                    onClick={() => void shell.tapNotification(card.id)}
                >
                    <span className="vs-banner-icon" aria-hidden="true">
                        D
                    </span>
                    <span className="vs-banner-text">
                        <span className="vs-banner-top">
                            <span>DoU</span>
                            <span>
                                {new Date(card.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </span>
                        <strong>{card.title ?? t('notif.noTitle')}</strong>
                        <span>{card.body ?? ''}</span>
                    </span>
                </button>
            ))}
        </div>
    );
};
