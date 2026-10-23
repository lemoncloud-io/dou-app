import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowLeft, ArrowRight, Hash } from 'lucide-react';

import { gsap, MOTION_OK } from '../hooks/useMotion';
import { wrapIndex } from '../utils/wrapIndex';
import { Avatar } from './mocks';

const SCENES = [
    { key: 'family', members: ['M', 'D', 'G', 'S'], surface: 'bg-[#FFE3D8]' },
    { key: 'study', members: ['Y', 'H', 'K'], surface: 'bg-[#DCE7FF]' },
    { key: 'team', members: ['J', 'E', 'L', 'P'], surface: 'bg-[#E8E0FF]' },
    { key: 'club', members: ['R', 'O', 'N', 'T', 'B'], surface: 'bg-[#E6F7B8]' },
] as const;

/**
 * Who DoU is for, shown one circle at a time: a stack of overlapping members beside the circle's
 * own description and the chat rooms it would keep. The arrows loop in both directions.
 */
export const ScenesSection = () => {
    const { t } = useTranslation();
    const [index, setIndex] = useState(0);
    const panel = useRef<HTMLDivElement>(null);
    const scene = SCENES[index];
    const rooms = t(`home.scenes.${scene.key}.rooms`, { returnObjects: true }) as string[];

    const step = (delta: number) => {
        const next = wrapIndex(index, delta, SCENES.length);
        if (panel.current && window.matchMedia(MOTION_OK).matches) {
            gsap.fromTo(
                panel.current,
                { opacity: 0, x: delta * 40 },
                { opacity: 1, x: 0, duration: 0.7, ease: 'expo.out' }
            );
        }
        setIndex(next);
    };

    return (
        <section className="pb-32 md:pb-48">
            <div className="mx-auto max-w-7xl px-6 lg:px-10">
                <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
                    <h2 className="max-w-2xl font-display text-[clamp(2.25rem,4.2vw,4rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink [word-break:keep-all]">
                        {t('home.scenes.title')}
                    </h2>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => step(-1)}
                            aria-label={t('home.scenes.previous')}
                            className="flex h-14 w-14 items-center justify-center rounded-full text-ink ring-1 ring-inset ring-ink/20 transition-colors hover:bg-ink hover:text-white"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => step(1)}
                            aria-label={t('home.scenes.next')}
                            className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white transition-colors hover:bg-ink/85"
                        >
                            <ArrowRight className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <div
                    ref={panel}
                    aria-live="polite"
                    className={`mt-16 grid gap-10 overflow-hidden rounded-[2.5rem] p-8 transition-colors duration-700 md:mt-20 md:p-14 lg:grid-cols-12 lg:items-center ${scene.surface}`}
                >
                    <div className="flex items-center lg:col-span-5" aria-hidden="true">
                        {scene.members.map((label, memberIndex) => (
                            <span key={label} className={memberIndex === 0 ? '' : '-ml-6 md:-ml-8'}>
                                <Avatar
                                    label={label}
                                    tone={memberIndex}
                                    size="h-20 w-20 text-2xl ring-4 md:h-28 md:w-28 md:text-3xl"
                                />
                            </span>
                        ))}
                    </div>

                    <div className="lg:col-span-7">
                        <p className="font-display text-sm font-medium text-ink/50">
                            {index + 1} / {SCENES.length}
                        </p>
                        <h3 className="mt-3 font-display text-4xl font-semibold tracking-[-0.03em] text-ink md:text-5xl">
                            {t(`home.scenes.${scene.key}.name`)}
                        </h3>
                        <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink/70 [word-break:keep-all] md:text-xl">
                            {t(`home.scenes.${scene.key}.body`)}
                        </p>
                        <ul className="mt-8 flex flex-wrap gap-2">
                            {rooms.map(room => (
                                <li
                                    key={room}
                                    className="flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-medium text-ink"
                                >
                                    <Hash className="h-3.5 w-3.5 text-ink/50" />
                                    {room}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    );
};
