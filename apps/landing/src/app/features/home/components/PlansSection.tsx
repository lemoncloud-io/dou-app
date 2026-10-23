import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Check } from 'lucide-react';

import { SECTION_IDS } from '../constants';
import { MOTION_OK, gsap, useMotion } from '../hooks/useMotion';

const PlanCard = ({ plan, featured = false }: { plan: 'free' | 'pro'; featured?: boolean }) => {
    const { t } = useTranslation();
    const items = t(`home.plans.${plan}.items`, { returnObjects: true }) as string[];
    return (
        <article
            data-plan
            className={`group relative flex flex-col overflow-hidden rounded-[2.5rem] p-10 md:p-12 ${
                featured ? 'grain bg-ink text-white' : 'bg-white text-ink ring-1 ring-ink/5'
            }`}
        >
            {featured && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-lime/30 blur-3xl transition-transform duration-700 ease-out group-hover:scale-125"
                />
            )}
            <div className="relative flex items-start justify-between gap-4">
                <div>
                    <p className={`text-sm font-medium ${featured ? 'text-white/55' : 'text-ink/50'}`}>
                        {t(`home.plans.${plan}.tag`)}
                    </p>
                    <h3 className="mt-2 font-display text-5xl font-semibold tracking-[-0.04em]">
                        {t(`home.plans.${plan}.name`)}
                    </h3>
                </div>
                {featured && (
                    <span className="rounded-full bg-lime px-4 py-2 text-sm font-semibold text-ink">
                        {t('home.plans.pro.highlight')}
                    </span>
                )}
            </div>
            <p
                className={`relative mt-6 max-w-sm text-lg leading-relaxed [word-break:keep-all] ${featured ? 'text-white/70' : 'text-ink/65'}`}
            >
                {t(`home.plans.${plan}.body`)}
            </p>
            <ul className={`relative mt-10 space-y-4 border-t pt-8 ${featured ? 'border-white/10' : 'border-ink/10'}`}>
                {items.map(item => (
                    <li key={item} className="flex items-start gap-3 text-base">
                        <span
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${featured ? 'bg-lime text-ink' : 'bg-ink/[0.07] text-ink'}`}
                        >
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                        {item}
                    </li>
                ))}
            </ul>
        </article>
    );
};

export const PlansSection = () => {
    const { t } = useTranslation();
    const ref = useRef<HTMLElement>(null);

    useMotion(ref, mm => {
        mm.add(MOTION_OK, () => {
            gsap.from('[data-plan]', {
                y: 80,
                opacity: 0,
                duration: 1.2,
                ease: 'expo.out',
                stagger: 0.15,
                scrollTrigger: { trigger: ref.current, start: 'top 70%' },
            });
        });
    });

    return (
        <section ref={ref} id={SECTION_IDS.plans} className="py-32 md:py-48">
            <div className="mx-auto max-w-7xl px-6 lg:px-10">
                <h2 className="max-w-4xl font-display text-[clamp(2.25rem,4.2vw,4rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink [word-break:keep-all]">
                    {t('home.plans.title')}
                </h2>
                <div className="mt-16 grid gap-4 md:mt-20 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                        <PlanCard plan="free" />
                    </div>
                    <div className="lg:col-span-7">
                        <PlanCard plan="pro" featured />
                    </div>
                </div>
            </div>
        </section>
    );
};
