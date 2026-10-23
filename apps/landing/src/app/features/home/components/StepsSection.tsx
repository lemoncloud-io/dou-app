import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Camera, Hash, Plus } from 'lucide-react';

import { Logo } from '@chatic/assets';

import { SECTION_IDS } from '../constants';
import { MOTION_OK, gsap, useMotion } from '../hooks/useMotion';
import { Avatar, InviteCard } from './mocks';

const Stage = ({ children }: { children: ReactNode }) => (
    <div
        data-step-stage
        aria-hidden="true"
        className="relative flex aspect-[5/4] items-center justify-center overflow-hidden rounded-[2rem] bg-white/[0.06] ring-1 ring-inset ring-white/10"
    >
        {children}
    </div>
);

const CreateStage = () => {
    const { t } = useTranslation();
    return (
        <div className="w-72 rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="relative mx-auto h-20 w-20">
                <img src={Logo.logo} alt="" className="h-20 w-20 rounded-3xl bg-cream object-contain p-2" />
                <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-lime text-ink ring-4 ring-white">
                    <Camera className="h-4 w-4" />
                </span>
            </div>
            <p className="mt-5 rounded-2xl bg-[#F1F2F5] px-4 py-3 text-left font-display text-lg font-semibold text-ink">
                {t('home.mock.cloud')}
                <span className="ml-0.5 inline-block h-5 w-px translate-y-1 bg-ink motion-safe:animate-pulse" />
            </p>
        </div>
    );
};

const OrganizeStage = () => {
    const { t } = useTranslation();
    const places = [
        {
            name: t('home.scenes.family.name'),
            rooms: t('home.scenes.family.rooms', { returnObjects: true }) as string[],
        },
        { name: t('home.scenes.team.name'), rooms: t('home.scenes.team.rooms', { returnObjects: true }) as string[] },
    ];
    return (
        <div className="grid w-[85%] grid-cols-2 gap-3">
            {places.map((place, index) => (
                <div key={place.name} className="rounded-3xl bg-white p-4 shadow-2xl">
                    <div className="flex items-center gap-2">
                        <Avatar label={place.name.slice(0, 1)} tone={index + 1} size="h-7 w-7 text-[10px]" />
                        <span className="truncate text-sm font-semibold text-ink">{place.name}</span>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                        {place.rooms.map(room => (
                            <li
                                key={room}
                                className="flex items-center gap-1.5 truncate rounded-xl bg-[#F6F6F8] px-2.5 py-2 text-[13px] text-ink/70"
                            >
                                <Hash className="h-3 w-3 shrink-0" />
                                {room}
                            </li>
                        ))}
                        <li className="flex items-center justify-center rounded-xl border border-dashed border-ink/15 py-2 text-ink/40">
                            <Plus className="h-3.5 w-3.5" />
                        </li>
                    </ul>
                </div>
            ))}
        </div>
    );
};

/**
 * The left column holds the section title still while the three steps scroll past on the right.
 * Only on wide screens and only with motion allowed: on a phone, or with reduced motion, the title
 * simply sits above the steps.
 */
export const StepsSection = () => {
    const { t } = useTranslation();
    const ref = useRef<HTMLElement>(null);

    const steps = [
        { key: 'create', stage: <CreateStage /> },
        { key: 'organize', stage: <OrganizeStage /> },
        {
            key: 'invite',
            stage: <InviteCard className="scale-110 shadow-2xl" />,
        },
    ] as const;

    useMotion(ref, (mm, root) => {
        mm.add(`${MOTION_OK} and (min-width: 1024px)`, () => {
            gsap.to('[data-steps-title]', {
                scrollTrigger: {
                    trigger: '[data-steps-title]',
                    start: 'top 128px',
                    endTrigger: '[data-steps-list]',
                    end: 'bottom bottom',
                    pin: true,
                    pinSpacing: false,
                },
            });
        });

        mm.add(MOTION_OK, () => {
            root.querySelectorAll<HTMLElement>('[data-step-stage]').forEach(stage => {
                gsap.fromTo(
                    stage,
                    { scale: 0.86, opacity: 0.4 },
                    {
                        scale: 1,
                        opacity: 1,
                        ease: 'none',
                        scrollTrigger: { trigger: stage, start: 'top bottom', end: 'center center', scrub: true },
                    }
                );
                gsap.to(stage, {
                    opacity: 0.25,
                    ease: 'none',
                    scrollTrigger: { trigger: stage, start: 'bottom 40%', end: 'bottom top', scrub: true },
                });
            });
        });
    });

    return (
        <section
            ref={ref}
            id={SECTION_IDS.how}
            className="grain relative overflow-hidden bg-ink py-32 text-white md:py-48"
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-40 top-1/4 h-[36rem] w-[36rem] rounded-full bg-lime/15 blur-[160px]"
            />
            <div className="relative mx-auto grid max-w-7xl gap-16 px-6 lg:grid-cols-12 lg:gap-8 lg:px-10">
                <div className="lg:col-span-5">
                    <div data-steps-title>
                        <h2 className="font-display text-[clamp(2.25rem,4vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] [word-break:keep-all]">
                            {t('home.steps.title')}
                        </h2>
                        <p className="mt-6 max-w-sm text-lg leading-relaxed text-white/60 [word-break:keep-all]">
                            {t('home.steps.lead')}
                        </p>
                    </div>
                </div>

                <ol data-steps-list className="flex flex-col gap-24 lg:col-span-6 lg:col-start-7 lg:gap-40">
                    {steps.map((step, index) => (
                        <li key={step.key}>
                            <Stage>{step.stage}</Stage>
                            <div className="mt-8 flex gap-5">
                                <span
                                    aria-hidden="true"
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime font-display text-sm font-semibold text-ink"
                                >
                                    {index + 1}
                                </span>
                                <div>
                                    <h3 className="font-display text-2xl font-semibold tracking-[-0.02em] md:text-[1.75rem]">
                                        {t(`home.steps.${step.key}.title`)}
                                    </h3>
                                    <p className="mt-3 max-w-md text-base leading-relaxed text-white/60 [word-break:keep-all]">
                                        {t(`home.steps.${step.key}.body`)}
                                    </p>
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
};
