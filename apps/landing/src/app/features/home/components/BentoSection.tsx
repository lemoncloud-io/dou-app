import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Link2, Users } from 'lucide-react';

import { SECTION_IDS } from '../constants';
import { MOTION_OK, gsap, useMotion } from '../hooks/useMotion';
import { Avatar, CloudTree, LockBadge, SelfChatCard } from './mocks';

const Card = ({ className, children }: { className: string; children: ReactNode }) => (
    <article
        data-bento-card
        className={`group relative flex flex-col overflow-hidden rounded-[2rem] p-8 md:p-10 ${className}`}
    >
        {children}
    </article>
);

const CardText = ({ title, body, inverted = false }: { title: string; body: string; inverted?: boolean }) => (
    <div className="relative z-10 max-w-md">
        <h3
            className={`font-display text-2xl font-semibold tracking-[-0.02em] md:text-[1.75rem] ${inverted ? 'text-white' : 'text-ink'}`}
        >
            {title}
        </h3>
        <p
            className={`mt-3 text-base leading-relaxed [word-break:keep-all] ${inverted ? 'text-white/65' : 'text-ink/60'}`}
        >
            {body}
        </p>
    </div>
);

export const BentoSection = () => {
    const { t } = useTranslation();
    const ref = useRef<HTMLElement>(null);

    useMotion(ref, mm => {
        mm.add(MOTION_OK, () => {
            gsap.from('[data-bento-card]', {
                y: 60,
                opacity: 0,
                duration: 1.1,
                ease: 'expo.out',
                stagger: 0.1,
                scrollTrigger: { trigger: '[data-bento-grid]', start: 'top 80%' },
            });
        });
    });

    return (
        <section ref={ref} id={SECTION_IDS.features} className="relative py-32 md:py-48">
            <div className="mx-auto max-w-7xl px-6 lg:px-10">
                <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                    <h2 className="max-w-3xl font-display text-[clamp(2.25rem,4.2vw,4rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink [word-break:keep-all]">
                        {t('home.bento.title')}
                    </h2>
                    <p className="max-w-md text-lg leading-relaxed text-ink/60 [word-break:keep-all]">
                        {t('home.bento.lead')}
                    </p>
                </div>

                {/*
                 * 12 columns on wide screens: the cloud card takes 7 columns over two rows, the
                 * invite and group cards take the remaining 5 on one row each, and Self Chat spans
                 * the full third row. Two columns on tablets: cloud and Self Chat span both, the
                 * two small cards share a row. Every cell is filled at every breakpoint.
                 */}
                <div
                    data-bento-grid
                    className="mt-16 grid grid-flow-dense auto-rows-[minmax(17rem,auto)] grid-cols-1 gap-4 md:mt-20 md:grid-cols-2 lg:grid-cols-12"
                >
                    <Card className="bg-white md:col-span-2 lg:col-span-7 lg:row-span-2">
                        <CardText title={t('home.bento.cloud.title')} body={t('home.bento.cloud.body')} />
                        <div className="mt-10 flex flex-1 items-end justify-center">
                            <div className="w-full max-w-md transition-transform duration-700 ease-out group-hover:-translate-y-2 group-hover:scale-[1.03]">
                                <CloudTree />
                            </div>
                        </div>
                    </Card>

                    <Card className="bg-ink lg:col-span-5">
                        <div
                            aria-hidden="true"
                            className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lime/25 blur-3xl transition-transform duration-700 ease-out group-hover:scale-125"
                        />
                        <div className="mb-auto flex items-center gap-3" aria-hidden="true">
                            <LockBadge />
                            <span className="flex h-14 items-center gap-2 rounded-2xl bg-white/10 px-4 text-sm text-white/70 transition-transform duration-700 ease-out group-hover:translate-x-2">
                                <Link2 className="h-4 w-4 text-lime" />
                                dou.chatic.io/i
                            </span>
                        </div>
                        <div className="mt-10">
                            <CardText
                                inverted
                                title={t('home.bento.invite.title')}
                                body={t('home.bento.invite.body')}
                            />
                        </div>
                    </Card>

                    <Card className="bg-lime lg:col-span-5">
                        <div className="mb-auto flex items-center justify-between" aria-hidden="true">
                            <span className="font-display text-7xl font-semibold leading-none tracking-[-0.05em] text-ink transition-transform duration-700 ease-out group-hover:scale-105">
                                100
                            </span>
                            <span className="flex -space-x-3 transition-transform duration-700 ease-out group-hover:-translate-x-2">
                                {['A', 'B', 'C', 'D', 'E'].map((label, index) => (
                                    <Avatar key={label} label={label} tone={index + 1} size="h-10 w-10 text-xs" />
                                ))}
                                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white ring-2 ring-white">
                                    <Users className="h-4 w-4" />
                                </span>
                            </span>
                        </div>
                        <div className="mt-10">
                            <CardText title={t('home.bento.group.title')} body={t('home.bento.group.body')} />
                        </div>
                    </Card>

                    <Card className="bg-[#E9E4D4] md:col-span-2 lg:col-span-12 lg:flex-row lg:items-center lg:justify-between">
                        <CardText title={t('home.bento.self.title')} body={t('home.bento.self.body')} />
                        <div
                            className="mt-10 flex justify-end transition-transform duration-700 ease-out group-hover:-translate-y-1 group-hover:scale-105 lg:mt-0 lg:w-1/3"
                            aria-hidden="true"
                        >
                            <SelfChatCard />
                        </div>
                    </Card>
                </div>
            </div>
        </section>
    );
};
