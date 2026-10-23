import { Fragment, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Logo } from '@chatic/assets';

import { MOTION_OK, gsap, useMotion } from '../hooks/useMotion';
const Words = ({ text }: { text: string }) => (
    <>
        {text.split(' ').map((word, index) => (
            <Fragment key={`${word}-${index}`}>
                <span data-word className="inline-block">
                    {word}
                </span>{' '}
            </Fragment>
        ))}
    </>
);

const InlinePill = ({ children, className }: { children: ReactNode; className: string }) => (
    <span
        data-word
        aria-hidden="true"
        className={`mx-1 inline-flex h-[0.95em] translate-y-[0.06em] items-center justify-center rounded-full align-baseline ${className}`}
    >
        {children}
    </span>
);

/**
 * One statement, read word by word as it scrolls past: every word starts nearly transparent and
 * the scroll position decides how many have come up to full ink. The small pills inside the
 * sentence are part of that same sequence.
 */
export const ManifestoSection = () => {
    const { t } = useTranslation();
    const ref = useRef<HTMLElement>(null);

    useMotion(ref, mm => {
        mm.add(MOTION_OK, () => {
            gsap.fromTo(
                '[data-word]',
                { opacity: 0.12 },
                {
                    opacity: 1,
                    ease: 'none',
                    stagger: 0.08,
                    scrollTrigger: { trigger: ref.current, start: 'top 70%', end: 'bottom 60%', scrub: true },
                }
            );
        });
    });

    return (
        <section ref={ref} className="py-32 md:py-48">
            <p className="mx-auto max-w-6xl px-6 font-display text-[clamp(2rem,4.6vw,4.5rem)] font-medium leading-[1.12] tracking-[-0.03em] text-ink [word-break:keep-all] lg:px-10">
                <Words text={t('home.manifesto.part1')} />
                <InlinePill className="w-[2.1em] bg-white shadow-[0_8px_24px_-12px_rgba(13,24,48,0.35)]">
                    <img src={Logo.logo} alt="" className="h-[0.75em] w-auto" />
                </InlinePill>{' '}
                <Words text={t('home.manifesto.part2')} />
                {/* Sized in em of the sentence itself, so the circles carry no text to change it. */}
                <InlinePill className="bg-ink px-[0.16em]">
                    {['bg-lime', 'bg-[#FF8A65]', 'bg-[#7CA7FF]'].map(tone => (
                        <span
                            key={tone}
                            className={`-ml-[0.14em] h-[0.6em] w-[0.6em] rounded-full border-[0.06em] border-ink first:ml-0 ${tone}`}
                        />
                    ))}
                </InlinePill>{' '}
                <Words text={t('home.manifesto.part3')} />
            </p>
        </section>
    );
};
