import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowUpRight, Globe, Monitor } from 'lucide-react';

import { storeUrls } from '../../../constants';
import { WEB_APP_URL } from '../constants';
import { AppleIcon, PlayIcon } from './StoreLinks';

type Platform = {
    key: 'ios' | 'android' | 'web' | 'desktop';
    icon: ReactNode;
    href?: string;
    surface: string;
};

const PLATFORMS: Platform[] = [
    { key: 'ios', icon: <AppleIcon className="h-7 w-7" />, href: storeUrls.ios, surface: 'bg-white text-ink' },
    {
        key: 'android',
        icon: <PlayIcon className="h-6 w-6" />,
        href: storeUrls.android,
        surface: 'bg-[#E9E4D4] text-ink',
    },
    { key: 'web', icon: <Globe className="h-6 w-6" />, href: WEB_APP_URL, surface: 'bg-lime text-ink' },
    { key: 'desktop', icon: <Monitor className="h-6 w-6" />, surface: 'bg-ink text-white' },
];

/**
 * Four vertical slices; the one under the pointer (or keyboard focus) widens and shows its detail.
 * Below the large breakpoint the slices stack and every one is open, because there is no hover to
 * reveal them with.
 */
export const PlatformsSection = () => {
    const { t } = useTranslation();
    const [active, setActive] = useState<Platform['key']>('ios');

    return (
        <section className="py-32 md:py-48">
            <div className="mx-auto max-w-7xl px-6 lg:px-10">
                <div className="grid gap-6 lg:grid-cols-12">
                    <h2 className="font-display text-[clamp(2.25rem,4.2vw,4rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink [word-break:keep-all] lg:col-span-7">
                        {t('home.platforms.title')}
                    </h2>
                    <p className="max-w-md self-end text-lg leading-relaxed text-ink/60 [word-break:keep-all] lg:col-span-4 lg:col-start-9">
                        {t('home.platforms.lead')}
                    </p>
                </div>

                <ul className="mt-16 flex flex-col gap-3 md:mt-20 lg:h-[30rem] lg:flex-row">
                    {PLATFORMS.map(platform => {
                        const isActive = active === platform.key;
                        const isDark = platform.key === 'desktop';
                        return (
                            <li
                                key={platform.key}
                                onMouseEnter={() => setActive(platform.key)}
                                onFocus={() => setActive(platform.key)}
                                className={`group relative flex min-h-[16rem] flex-col justify-between overflow-hidden rounded-[2rem] p-8 transition-[flex-grow] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] lg:min-h-0 lg:basis-0 ${platform.surface} ${
                                    isActive ? 'lg:grow-[3.2]' : 'lg:grow'
                                }`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-700 ease-out group-hover:scale-110 ${
                                        isDark ? 'bg-white/10' : 'bg-ink/[0.06]'
                                    }`}
                                >
                                    {platform.icon}
                                </span>

                                <div>
                                    <h3 className="font-display text-3xl font-semibold tracking-[-0.02em] lg:whitespace-nowrap">
                                        {t(`home.platforms.${platform.key}.name`)}
                                    </h3>
                                    <div
                                        className={`grid transition-[grid-template-rows,opacity] duration-700 ease-out ${
                                            isActive
                                                ? 'grid-rows-[1fr] opacity-100'
                                                : 'grid-rows-[1fr] opacity-100 lg:grid-rows-[0fr] lg:opacity-0'
                                        }`}
                                    >
                                        <div className="overflow-hidden">
                                            <p
                                                className={`mt-3 max-w-xs text-base leading-relaxed [word-break:keep-all] ${isDark ? 'text-white/65' : 'text-ink/65'}`}
                                            >
                                                {t(`home.platforms.${platform.key}.body`)}
                                            </p>
                                            {platform.href && (
                                                <a
                                                    href={platform.href}
                                                    {...(platform.key === 'web'
                                                        ? {}
                                                        : { target: '_blank', rel: 'noopener noreferrer' })}
                                                    className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white transition-transform duration-300 hover:-translate-y-0.5"
                                                >
                                                    {t(`home.platforms.${platform.key}.action`)}
                                                    <ArrowUpRight className="h-4 w-4" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </section>
    );
};
