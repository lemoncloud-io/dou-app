import { useTranslation } from 'react-i18next';

interface FeatureCardProps {
    featureKey: 'private' | 'safe' | 'group' | 'memo';
    index: number;
}

const featureIcons: Record<string, JSX.Element> = {
    private: <PrivateIcon />,
    safe: <SafeIcon />,
    group: <GroupIcon />,
    memo: <MemoIcon />,
};

export const FeatureCard = ({ featureKey, index }: FeatureCardProps): JSX.Element => {
    const { t } = useTranslation();
    const delayClass = `animate-delay-${(index + 1) * 100}`;

    return (
        <div
            className={`group relative bg-card rounded-2xl p-6 sm:p-8
                       border border-border
                       transition-all duration-300 ease-out
                       hover:border-accent
                       hover:bg-muted
                       hover:-translate-y-1
                       shadow-sm hover:shadow-md
                       animate-fade-in-up ${delayClass}`}
        >
            {/* Icon */}
            <div
                className="w-14 h-14 bg-accent/20 rounded-xl
                          flex items-center justify-center mb-5
                          transition-all duration-300
                          group-hover:bg-accent group-hover:scale-110"
            >
                <div className="text-foreground group-hover:text-accent-foreground transition-colors">
                    {featureIcons[featureKey]}
                </div>
            </div>

            {/* Title */}
            <h3 className="text-lg sm:text-xl font-bold text-foreground mb-2">{t(`features.${featureKey}.title`)}</h3>

            {/* Description */}
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                {t(`features.${featureKey}.description`)}
            </p>
        </div>
    );
};

function PrivateIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

function SafeIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
        </svg>
    );
}

function GroupIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path d="M8 9h8" />
            <path d="M8 13h6" />
        </svg>
    );
}

function MemoIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
        </svg>
    );
}
