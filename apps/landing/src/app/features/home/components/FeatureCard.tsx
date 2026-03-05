import type { Feature } from '../constants';

interface FeatureCardProps {
    feature: Feature;
}

const featureIcons: Record<string, JSX.Element> = {
    place: <PlaceIcon />,
    invite: <InviteIcon />,
    security: <SecurityIcon />,
    private: <PrivateIcon />,
};

export const FeatureCard = ({ feature }: FeatureCardProps): JSX.Element => (
    <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-[#eaeaec] hover:shadow-md transition-shadow">
        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#c4ff00] rounded-xl flex items-center justify-center mb-4 sm:mb-6">
            {featureIcons[feature.id]}
        </div>
        <h3 className="text-[18px] sm:text-[20px] font-semibold text-[#222325] mb-2 sm:mb-3 leading-snug">
            {feature.title}
        </h3>
        <p className="text-[14px] sm:text-[16px] text-[#53555b] leading-relaxed">{feature.description}</p>
    </div>
);

function PlaceIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#222325" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
    );
}

function InviteIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#222325" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
    );
}

function SecurityIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#222325" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
    );
}

function PrivateIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#222325" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    );
}
