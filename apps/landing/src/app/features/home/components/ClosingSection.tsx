import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ArrowUpRight } from 'lucide-react';

import { Logo } from '@chatic/assets';

import { SECTION_IDS, WEB_APP_URL } from '../constants';
import { MOTION_OK, gsap, useMotion } from '../hooks/useMotion';
import { PillLink, StoreLinks } from './StoreLinks';

const POLICY_LINKS = [
    { to: '/policy/terms', key: 'footer.terms' },
    { to: '/policy/privacy', key: 'footer.privacy' },
    { to: '/policy/child', key: 'footer.child' },
] as const;

/** The download call and the footer share one dark block, so the page ends on a single chapter. */
export const ClosingSection = () => {
    const { t } = useTranslation();
    const ref = useRef<HTMLElement>(null);

    useMotion(ref, mm => {
        mm.add(MOTION_OK, () => {
            gsap.from('[data-closing-logo]', {
                scale: 0.6,
                rotate: -12,
                opacity: 0,
                duration: 1.4,
                ease: 'expo.out',
                scrollTrigger: { trigger: ref.current, start: 'top 75%' },
            });
        });
    });

    return (
        <footer ref={ref} id={SECTION_IDS.download} className="px-3 pb-3">
            <div className="grain relative overflow-hidden rounded-[2.5rem] bg-ink text-white">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-0 h-[40rem] w-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime/20 blur-[160px]"
                />

                <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 pt-32 text-center md:pb-32 md:pt-48">
                    <img
                        data-closing-logo
                        src={Logo.logo}
                        alt=""
                        className="h-24 w-24 object-contain md:h-32 md:w-32"
                    />
                    <h2 className="mt-10 w-full max-w-5xl font-display text-[clamp(2.75rem,6vw,6rem)] font-semibold leading-[1] tracking-[-0.04em] [word-break:keep-all]">
                        {t('home.closing.title')}
                    </h2>
                    <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/60 md:text-xl">
                        {t('home.closing.body')}
                    </p>
                    <div className="mt-12 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
                        <StoreLinks
                            tone="light"
                            appStoreLabel={t('home.closing.appStore')}
                            googlePlayLabel={t('home.closing.googlePlay')}
                        />
                        <PillLink
                            href={WEB_APP_URL}
                            tone="outlineLight"
                            external={false}
                            icon={<ArrowUpRight className="order-last h-4 w-4" />}
                        >
                            {t('home.closing.web')}
                        </PillLink>
                    </div>
                </div>

                <div className="relative mx-auto grid max-w-6xl gap-10 border-t border-white/10 px-6 py-12 md:grid-cols-12 md:px-10">
                    <div className="md:col-span-6">
                        <img src={Logo.douWh} alt="DoU" className="h-6" />
                        <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">{t('footer.tagline')}</p>
                    </div>
                    <nav aria-label={t('footer.policies')} className="md:col-span-6 md:justify-self-end">
                        <ul className="flex flex-col gap-3 text-sm md:items-end">
                            {POLICY_LINKS.map(link => (
                                <li key={link.to}>
                                    <Link to={link.to} className="text-white/70 transition-colors hover:text-lime">
                                        {t(link.key)}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                    <p className="text-xs text-white/35 md:col-span-12">{t('footer.copyright')}</p>
                </div>
            </div>
        </footer>
    );
};
