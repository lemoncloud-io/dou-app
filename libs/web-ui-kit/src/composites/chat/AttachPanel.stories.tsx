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

/**
 * The panel as the chat room places it: in the page's positioned container, under the composer, which
 * the host keeps clear of the panel's height. Tap + to open it and × (or Escape) to close it; pick
 * photos in the recent row and the composer's send button goes live with nothing typed.
 */
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
                // What the room does: the composer keeps clear of the panel while it is open.
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
            />
        </div>
    );
};

export const WithRecentRow: Story = { render: () => <Demo /> };

/** A browser, or an app that cannot read the library: the three entry points alone. */
export const ActionsOnly: Story = { render: () => <Demo withRecent={false} /> };

/** A keyboard shorter than the content: the panel keeps the keyboard's height and scrolls. */
export const ShortKeyboard: Story = { render: () => <Demo height={240} /> };

/** Closed at first: tap + to watch it rise. */
export const Closed: Story = { render: () => <Demo initiallyOpen={false} /> };

type Mode = 'slide' | 'instant';

/**
 * The four ways a change can go: pick how the panel arrives and how it leaves, then open and close it.
 * `instant` puts it in place, or removes it, in one frame — no slide at all. Each settled change is
 * logged as the panel reports it through `onTransitionEnd`, at once for an instant one.
 */
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

/** The keyboard's own slide, as a stand-in: the shell's keyboard is drawn outside the page. */
const KEYBOARD_MOTION =
    'transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none';

/**
 * The handover the chat room makes, with a grey block standing in for the soft keyboard (which in the
 * app is drawn by the OS, over the page). The keyboard and the panel share one slot of one height, so
 * the composer above them never moves while they swap:
 *
 * - Keyboard up, tap +: the panel is put in place instantly behind the keyboard, which slides away.
 * - Panel open, tap the field: the keyboard slides up over the panel, which is then removed instantly.
 * - No keyboard, tap +, or ×: the panel slides, and the composer moves with it on the same curve.
 */
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
        // Keyboard up: in place under it, and the keyboard goes.
        setEnter(keyboard ? 'instant' : 'slide');
        setOpen(true);
        setKeyboard(false);
    };
    const focusField = () => {
        setKeyboard(true);
        if (!open) return;
        // Once the keyboard has covered the panel, it can go where it stands.
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
                // The field's focus, not the + button's: tapping + moves focus too.
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

/**
 * The panel moved by its host (`motion="external"`): one frame loop writes the panel's translate and the
 * composer's bottom padding from the same eased value, so the composer's top stays the same 8px above the
 * panel's on every frame. Two transitions — the panel's transform and the composer's padding — start a
 * frame apart on iOS WebKit, and the composer visibly trails. Tap + and × quickly to see a slide turn
 * around from wherever the last frame left it.
 */
const HostMovedDemo = () => {
    const height = 306;
    const [open, setOpen] = useState(false);
    const [log, setLog] = useState<string[]>([]);
    const panelRef = useRef<AttachPanelHandle>(null);
    const composerRef = useRef<HTMLDivElement>(null);
    // Where the last frame left both: 0 with the panel below, 1 with it in place.
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

    // A layout effect, so the slide's first frame is drawn before the commit that started it is painted.
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
        // A newer change takes over from wherever this one has got to.
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

/**
 * The first open in the app, before the shell has said whether it can read the library: the recent row
 * is drawn with skeleton tiles, so photos, camera and files are where they will stay. Answer with photos
 * and they take the skeletons' places; answer that there is no library and the row folds away, the tiles
 * rising with it.
 */
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
