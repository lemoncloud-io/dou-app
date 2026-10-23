import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowUpRight } from 'lucide-react';

import { SECTION_IDS, WEB_APP_URL } from '../constants';
import { MOTION_OK, gsap, useMotion } from '../hooks/useMotion';
import { ChatScreen, InviteCard, PhoneFrame } from './mocks';
import { PillLink } from './StoreLinks';

export const HeroSection = () => {
    const { t } = useTranslation();
    const ref = useRef<HTMLElement>(null);

    useMotion(ref, mm => {
        mm.add(MOTION_OK, () => {
            gsap.timeline({ defaults: { ease: 'expo.out', duration: 1.4 } })
                .from('[data-hero-line]', { yPercent: 40, opacity: 0, stagger: 0.12 })
                .from('[data-hero-phone]', { y: 80, opacity: 0, duration: 1.6 }, 0.15)
                .from('[data-hero-invite]', { x: 40, y: 30, opacity: 0, duration: 1.2 }, 0.6);

            // The phone drifts up slower than the page as the hero leaves, so the two layers separate.
            gsap.to('[data-hero-phone]', {
                yPercent: -12,
                ease: 'none',
                scrollTrigger: { trigger: ref.current, start: 'top top', end: 'bottom top', scrub: true },
            });
        });
    });

    return (
        <section ref={ref} id="top" className="relative overflow-hidden pb-24 pt-36 md:pb-40 md:pt-44">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-40 top-10 h-[42rem] w-[42rem] rounded-full bg-lime/30 blur-[140px]"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-32 bottom-0 h-[28rem] w-[28rem] rounded-full bg-[#C9B6FF]/30 blur-[120px]"
            />

            <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-12 lg:gap-8 lg:px-10">
                <div className="lg:col-span-7">
                    <h1
                        data-hero-line
                        className="w-full max-w-4xl font-display text-[clamp(2.75rem,5.2vw,5.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink [word-break:keep-all]"
                    >
                        {t('home.hero.title')}
                    </h1>
                    <p
                        data-hero-line
                        className="mt-8 max-w-xl text-lg leading-relaxed text-ink/65 [word-break:keep-all] md:text-xl"
                    >
                        {t('home.hero.subtitle')}
                    </p>
                    <div data-hero-line className="mt-12 flex flex-col gap-3 sm:flex-row">
                        <PillLink href={`#${SECTION_IDS.download}`} tone="dark" external={false}>
                            {t('home.hero.primary')}
                        </PillLink>
                        <PillLink
                            href={WEB_APP_URL}
                            tone="outline"
                            external={false}
                            icon={<ArrowUpRight className="order-last h-4 w-4" />}
                        >
                            {t('home.hero.secondary')}
                        </PillLink>
                    </div>
                </div>

                <div className="relative mx-auto w-full max-w-[19rem] lg:col-span-4 lg:col-start-9" aria-hidden="true">
                    <div data-hero-phone>
                        <PhoneFrame className="rotate-[4deg]">
                            <ChatScreen />
                        </PhoneFrame>
                    </div>
                    <div data-hero-invite className="absolute -left-24 -bottom-10 hidden sm:block lg:-left-44">
                        <InviteCard className="-rotate-[5deg]" />
                    </div>
                </div>
            </div>
        </section>
    );
};
