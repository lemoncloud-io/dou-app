import type { ReactNode } from 'react';

import { storeUrls } from '../../../constants';

export const AppleIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
);

export const PlayIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35m13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27m3.35-4.31c.34.27.56.69.56 1.19s-.22.92-.56 1.19l-2.11 1.24-2.5-2.5 2.5-2.5 2.11 1.38M6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z" />
    </svg>
);

const TONES = {
    dark: 'bg-ink text-white hover:bg-ink/90 focus-visible:outline-ink',
    light: 'bg-white text-ink hover:bg-white/90 focus-visible:outline-white',
    lime: 'bg-lime text-ink hover:brightness-95 focus-visible:outline-lime',
    outline: 'bg-transparent text-ink ring-1 ring-inset ring-ink/20 hover:bg-ink/5 focus-visible:outline-ink',
    outlineLight:
        'bg-transparent text-white ring-1 ring-inset ring-white/30 hover:bg-white/10 focus-visible:outline-white',
} as const;

export type PillTone = keyof typeof TONES;

export const PillLink = ({
    href,
    tone,
    icon,
    children,
    external = true,
}: {
    href: string;
    tone: PillTone;
    icon?: ReactNode;
    children: ReactNode;
    external?: boolean;
}) => (
    <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className={`inline-flex h-14 items-center justify-center gap-2.5 rounded-full px-7 text-[15px] font-semibold transition-[transform,background-color,filter] duration-300 ease-out hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 active:translate-y-0 ${TONES[tone]}`}
    >
        {icon}
        {children}
    </a>
);

export const StoreLinks = ({
    tone,
    appStoreLabel,
    googlePlayLabel,
}: {
    tone: PillTone;
    appStoreLabel: string;
    googlePlayLabel: string;
}) => (
    <>
        <PillLink href={storeUrls.ios} tone={tone} icon={<AppleIcon />}>
            {appStoreLabel}
        </PillLink>
        <PillLink href={storeUrls.android} tone={tone} icon={<PlayIcon className="h-[18px] w-[18px]" />}>
            {googlePlayLabel}
        </PillLink>
    </>
);
