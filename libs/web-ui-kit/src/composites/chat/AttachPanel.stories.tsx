import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import {
    AttachPanel,
    type AttachPanelHandle,
    ComposerAttachButton,
    MessageInput,
    prefersReducedMotion,
    RecentPhotoStrip,
    SLIDE_MS,
    slideEase,
} from '@chatic/web-ui-kit';

const meta: Meta<typeof AttachPanel> = {
    title: 'web-ui-kit/composites/AttachPanel',
    component: AttachPanel,
    parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof AttachPanel>;

const photos = Array.from({ length: 30 }, (_, i) => ({
    id: `p${i}`,
    src: `https://picsum.photos/seed/dou-${i}/240/240`,
    ...(i === 2 ? { kind: 'video' as const, durationMs: 42_000 } : {}),
}));

const Demo = ({
    withRecent = true,
    height = 306,
    initiallyOpen = true,
}: {
    withRecent?: boolean;
    height?: number;
    initiallyOpen?: boolean;
}) => {
    const [open, setOpen] = useState(initiallyOpen);
    const [text, setText] = useState('');
    const [picked, setPicked] = useState<string[]>([]);
    const [sent, setSent] = useState<string | null>(null);
    const toggle = (id: string) =>
        setPicked(previous => (previous.includes(id) ? previous.filter(p => p !== id) : [...previous, id]));

    return (
        <div className="relative mx-auto h-[700px] w-[375px] overflow-hidden border border-input-border bg-background">
            <p className="p-4 text-[14px] text-description">{sent ?? 'Nothing sent yet.'}</p>
            <div
                className="absolute inset-x-0 bottom-0 z-20 px-4 pt-2"
                style={{ paddingBottom: open ? `calc(${height}px + var(--safe-bottom, 0px) + 8px)` : 8 }}
            >
                <MessageInput
                    value={text}
                    onChange={setText}
                    placeholder="메시지를 입력해 주세요"
                    sendReady={picked.length > 0}
                    onSend={caption => {
                        setSent(`Sent ${picked.length} photo(s)${caption ? ` with "${caption}"` : ''}`);
                        setText('');
                        setPicked([]);
                        setOpen(false);
                    }}
                    leadingSlot={<ComposerAttachButton open={open} onClick={() => setOpen(v => !v)} />}
                />
            </div>
            <AttachPanel
                open={open}
                height={height}
                onClose={() => setOpen(false)}
                labels={{ photo: '사진', camera: '카메라', file: '파일', title: '첨부' }}
                recent={
                    withRecent ? (
                        <RecentPhotoStrip
                            title="최근 사진"
                            seeAllLabel="전체 보기"
                            onSeeAll={() => setSent('See all')}
                            photos={photos}
                            picked={picked}
                            onToggle={toggle}
                            max={10}
                        />
                    ) : undefined
                }
                onPhoto={() => setSent('Photos')}
                onCamera={() => setSent('Camera')}
                onFile={() => setSent('Files')}
                onVoice={() => setSent('Voice')}
            />
        </div>
    );
};

export const WithRecentRow: Story = { render: () => <Demo /> };

export const ActionsOnly: Story = { render: () => <Demo withRecent={false} /> };

export const ShortKeyboard: Story = { render: () => <Demo height={240} /> };

export const Closed: Story = { render: () => <Demo initiallyOpen={false} /> };

type Mode = 'slide' | 'instant';

const ModesDemo = () => {
    const [open, setOpen] = useState(false);
    const [enter, setEnter] = useState<Mode>('slide');
    const [exit, setExit] = useState<Mode>('slide');
    const [log, setLog] = useState<string[]>([]);
    const startedAt = useRef(0);
    const toggle = () => {
        startedAt.current = performance.now();
        setOpen(value => !value);
    };
    const choice = (value: Mode, current: Mode, set: (mode: Mode) => void, name: string) => (
        <button
            type="button"
            aria-pressed={current === value}
            onClick={() => set(value)}
            className="rounded-full border border-input-border px-3 py-1 text-[13px] aria-pressed:bg-brand-ink aria-pressed:text-white"
        >
            {name} {value}
        </button>
    );
    return (
        <div className="relative mx-auto h-[700px] w-[375px] overflow-hidden border border-input-border bg-background">
            <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-2">
                    {choice('slide', enter, setEnter, 'enter:')}
                    {choice('instant', enter, setEnter, 'enter:')}
                </div>
                <div className="flex flex-wrap gap-2">
                    {choice('slide', exit, setExit, 'exit:')}
                    {choice('instant', exit, setExit, 'exit:')}
                </div>
                <button
                    type="button"
                    onClick={toggle}
                    className="rounded-full bg-brand-ink px-4 py-2 text-[14px] font-semibold text-white"
                >
                    {open ? 'Close' : 'Open'}
                </button>
                <ol className="space-y-1 text-[13px] text-description">
                    {log.map((line, i) => (
                        <li key={i}>{line}</li>
                    ))}
                </ol>
            </div>
            <AttachPanel
                open={open}
                height={306}
                enter={enter}
                exit={exit}
                onTransitionEnd={state =>
                    setLog(previous => [
                        `${state} after ${Math.round(performance.now() - startedAt.current)}ms`,
                        ...previous.slice(0, 7),
                    ])
                }
                onClose={toggle}
                labels={{ photo: '사진', camera: '카메라', file: '파일', title: '첨부' }}
                onPhoto={() => undefined}
                onCamera={() => undefined}
                onFile={() => undefined}
            />
        </div>
    );
};

export const EnterAndExitModes: Story = { render: () => <ModesDemo /> };

const KEYBOARD_MOTION =
    'transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none';

const HandoverDemo = () => {
    const height = 306;
    const [keyboard, setKeyboard] = useState(false);
    const [open, setOpen] = useState(false);
    const [enter, setEnter] = useState<Mode>('slide');
    const [exit, setExit] = useState<Mode>('slide');
    const timer = useRef(0);
    useEffect(() => () => window.clearTimeout(timer.current), []);

    const plus = () => {
        if (open) {
            setExit('slide');
            setOpen(false);
            return;
        }
        setEnter(keyboard ? 'instant' : 'slide');
        setOpen(true);
        setKeyboard(false);
    };
    const focusField = () => {
        setKeyboard(true);
        if (!open) return;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
            setExit('instant');
            setOpen(false);
        }, 300);
    };
    const slot = keyboard || open;

    return (
        <div className="relative mx-auto h-[700px] w-[375px] overflow-hidden border border-input-border bg-background">
            <p className="p-4 text-[14px] text-description">
                Tap the field to raise the keyboard, + to swap to the panel, the field again to swap back. Tap above the
                composer to dismiss the keyboard.
            </p>
            <button
                type="button"
                aria-label="Dismiss keyboard"
                className="absolute inset-0"
                onClick={() => {
                    (document.activeElement as HTMLElement | null)?.blur();
                    setKeyboard(false);
                }}
            />
            <div
                onFocus={event => {
                    if (event.target instanceof HTMLTextAreaElement) focusField();
                }}
                className={`absolute inset-x-0 bottom-0 z-20 px-4 pt-2 ${KEYBOARD_MOTION.replace('transition-transform', 'transition-[padding]')}`}
                style={{ paddingBottom: slot ? height + 8 : 8 }}
            >
                <MessageInput
                    value=""
                    onChange={() => undefined}
                    onSend={() => undefined}
                    placeholder="메시지를 입력해 주세요"
                    leadingSlot={<ComposerAttachButton open={open} onClick={plus} />}
                />
            </div>
            <AttachPanel
                open={open}
                height={height}
                enter={enter}
                exit={exit}
                onClose={plus}
                labels={{ photo: '사진', camera: '카메라', file: '파일', title: '첨부' }}
                onPhoto={() => undefined}
                onCamera={() => undefined}
                onFile={() => undefined}
            />
            <div
                aria-hidden
                className={`absolute inset-x-0 bottom-0 z-40 flex items-center justify-center bg-neutral-300 text-[13px] text-neutral-600 ${KEYBOARD_MOTION} ${keyboard ? 'translate-y-0' : 'translate-y-full'}`}
                style={{ height }}
            >
                keyboard
            </div>
        </div>
    );
};

export const KeyboardHandover: Story = { render: () => <HandoverDemo /> };

const HostMovedDemo = () => {
    const height = 306;
    const [open, setOpen] = useState(false);
    const [log, setLog] = useState<string[]>([]);
    const panelRef = useRef<AttachPanelHandle>(null);
    const composerRef = useRef<HTMLDivElement>(null);
    const progress = useRef(0);
    const frame = useRef(0);
    const startedAt = useRef(0);

    const draw = (value: number) => {
        progress.current = value;
        const surface = panelRef.current?.surface;
        if (surface) surface.style.transform = `translateY(${(1 - value) * 100}%)`;
        const composer = composerRef.current;
        if (composer) composer.style.paddingBottom = `calc(${value} * (${height}px + var(--safe-bottom, 0px)) + 8px)`;
    };

    useLayoutEffect(() => {
        const from = progress.current;
        const to = open ? 1 : 0;
        if (from === to || prefersReducedMotion()) {
            draw(to);
            panelRef.current?.settle();
            return undefined;
        }
        draw(from);
        let start: number | null = null;
        const step = (now: number) => {
            start ??= now;
            const t = Math.min(1, (now - start) / SLIDE_MS);
            draw(from + (to - from) * slideEase(t));
            if (t < 1) frame.current = requestAnimationFrame(step);
            else panelRef.current?.settle();
        };
        frame.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame.current);
    }, [open]);

    const toggle = () => {
        startedAt.current = performance.now();
        setOpen(value => !value);
    };

    return (
        <div className="relative mx-auto h-[700px] w-[375px] overflow-hidden border border-input-border bg-background">
            <ol className="space-y-1 p-4 text-[13px] text-description">
                <li>Tap + and ×: the composer rides the panel's top edge.</li>
                {log.map((line, i) => (
                    <li key={i}>{line}</li>
                ))}
            </ol>
            <div ref={composerRef} className="absolute inset-x-0 bottom-0 z-20 px-4 pt-2" style={{ paddingBottom: 8 }}>
                <MessageInput
                    value=""
                    onChange={() => undefined}
                    onSend={() => undefined}
                    placeholder="메시지를 입력해 주세요"
                    leadingSlot={<ComposerAttachButton open={open} onClick={toggle} />}
                />
            </div>
            <AttachPanel
                ref={panelRef}
                motion="external"
                open={open}
                height={height}
                onClose={toggle}
                onTransitionEnd={state =>
                    setLog(previous => [
                        `${state} after ${Math.round(performance.now() - startedAt.current)}ms`,
                        ...previous.slice(0, 6),
                    ])
                }
                labels={{ photo: '사진', camera: '카메라', file: '파일', title: '첨부' }}
                onPhoto={() => undefined}
                onCamera={() => undefined}
                onFile={() => undefined}
            />
        </div>
    );
};

export const HostMovedSlide: Story = { render: () => <HostMovedDemo /> };

type Library = 'asking' | 'answered' | 'none';

const LoadingRowDemo = () => {
    const [library, setLibrary] = useState<Library>('asking');
    const [round, setRound] = useState(0);
    const button = 'rounded-full border border-input-border px-3 py-1 text-[13px]';
    return (
        <div className="relative mx-auto h-[700px] w-[375px] overflow-hidden border border-input-border bg-background">
            <div className="flex flex-wrap gap-2 p-4">
                <button type="button" className={button} onClick={() => setLibrary('answered')}>
                    Library answers
                </button>
                <button type="button" className={button} onClick={() => setLibrary('none')}>
                    No library
                </button>
                <button
                    type="button"
                    className={button}
                    onClick={() => {
                        setLibrary('asking');
                        setRound(value => value + 1);
                    }}
                >
                    Open again
                </button>
            </div>
            <AttachPanel
                key={round}
                open
                height={306}
                onClose={() => undefined}
                labels={{ photo: '사진', camera: '카메라', file: '파일', title: '첨부' }}
                recent={
                    <RecentPhotoStrip
                        title="최근 사진"
                        seeAllLabel="전체 보기"
                        onSeeAll={() => undefined}
                        loading={library === 'asking'}
                        photos={library === 'answered' ? photos : []}
                        onToggle={() => undefined}
                    />
                }
                onPhoto={() => undefined}
                onCamera={() => undefined}
                onFile={() => undefined}
            />
        </div>
    );
};

export const RecentRowWhileAsking: Story = { render: () => <LoadingRowDemo /> };
