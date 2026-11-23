import {
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { BottomSheet } from '@chatic/web-ui-kit';

import { useRecentEmojiStore } from '../stores/useRecentEmojiStore';
import { EMOJI_CATEGORIES, emojiNameKey } from '../utils/emoji';
import { LONG_PRESS_DELAY_MS, MOVE_CANCEL_PX } from '../utils/longPress';

interface EmojiPickerSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPick: (emoji: string) => void;
}

export const EmojiPickerSheet = ({ open, onOpenChange, onPick }: EmojiPickerSheetProps) => {
    const { t } = useTranslation();
    const { t: tEmoji } = useTranslation('emoji', { useSuspense: false });
    const recent = useRecentEmojiStore(s => s.recent);
    const remember = useRecentEmojiStore(s => s.remember);
    const [categoryKey, setCategoryKey] = useState(EMOJI_CATEGORIES[0].key);

    const [held, setHeld] = useState<HeldEmoji | null>(null);
    const timerRef = useRef<number | null>(null);
    const pressOriginRef = useRef<{ x: number; y: number } | null>(null);
    const longPressFiredRef = useRef(false);

    const clearTimer = () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };
    useEffect(() => clearTimer, []);

    const endHold = () => {
        clearTimer();
        setHeld(null);
    };
    useEffect(() => {
        if (!open) endHold();
    }, [open]);

    const nameOf = (emoji: string) => tEmoji(emojiNameKey(emoji), { defaultValue: '' });

    const showName = (target: HTMLElement, emoji: string): boolean => {
        const name = nameOf(emoji);
        if (!name) return false;
        longPressFiredRef.current = true;
        const rect = target.getBoundingClientRect();
        setHeld({ emoji, name, x: rect.left + rect.width / 2, y: rect.top });
        return true;
    };

    const startHold = (event: ReactPointerEvent<HTMLButtonElement>, emoji: string) => {
        clearTimer();
        longPressFiredRef.current = false;
        pressOriginRef.current = { x: event.clientX, y: event.clientY };
        const target = event.currentTarget;
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            showName(target, emoji);
        }, LONG_PRESS_DELAY_MS);
    };

    const moveHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const origin = pressOriginRef.current;
        if (timerRef.current === null || !origin) return;
        if (
            Math.abs(event.clientX - origin.x) > MOVE_CANCEL_PX ||
            Math.abs(event.clientY - origin.y) > MOVE_CANCEL_PX
        ) {
            clearTimer();
        }
    };

    const holdFromContextMenu = (event: ReactMouseEvent<HTMLButtonElement>, emoji: string) => {
        event.preventDefault();
        clearTimer();
        showName(event.currentTarget, emoji);
    };

    const pick = (event: ReactMouseEvent<HTMLButtonElement>, emoji: string) => {
        if (event.detail !== 0 && longPressFiredRef.current) {
            longPressFiredRef.current = false;
            return;
        }
        longPressFiredRef.current = false;
        remember(emoji);
        onPick(emoji);
    };

    const isRecent = categoryKey === 'recent';
    const category = EMOJI_CATEGORIES.find(c => c.key === categoryKey) ?? EMOJI_CATEGORIES[0];
    const label = isRecent ? t('emoji.recent') : t(`emoji.cat.${category.key}`);
    const emojis = isRecent ? recent : category.emojis;

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={t('chat.room.pickEmoji')}
            onClose={() => onOpenChange(false)}
            className="h-[50vh]"
        >
            <div className="flex h-full flex-col gap-2 px-4 pb-2">
                <div
                    role="tablist"
                    aria-label={t('chat.room.pickEmoji')}
                    className="flex shrink-0 items-center gap-0.5 overflow-x-auto"
                >
                    {recent.length > 0 && (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={isRecent}
                            title={t('emoji.recent')}
                            onClick={() => setCategoryKey('recent')}
                            className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-md text-base transition-colors active:bg-accent',
                                isRecent && 'bg-accent'
                            )}
                        >
                            🕘
                        </button>
                    )}
                    {EMOJI_CATEGORIES.map(cat => (
                        <button
                            key={cat.key}
                            type="button"
                            role="tab"
                            aria-selected={categoryKey === cat.key}
                            title={t(`emoji.cat.${cat.key}`)}
                            onClick={() => setCategoryKey(cat.key)}
                            className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-md text-base transition-colors active:bg-accent',
                                categoryKey === cat.key && 'bg-accent'
                            )}
                        >
                            {cat.icon}
                        </button>
                    ))}
                </div>
                <p className="px-0.5 text-xs uppercase text-muted-foreground">{label}</p>
                <div className="grid min-h-0 flex-1 grid-cols-8 content-start gap-0.5 overflow-y-auto">
                    {emojis.map(emoji => (
                        <button
                            key={emoji}
                            type="button"
                            onClick={event => pick(event, emoji)}
                            onPointerDown={event => startHold(event, emoji)}
                            onPointerMove={moveHold}
                            onPointerUp={endHold}
                            onPointerLeave={endHold}
                            onPointerCancel={endHold}
                            onContextMenu={event => holdFromContextMenu(event, emoji)}
                            aria-label={nameOf(emoji) || undefined}
                            className="flex size-10 select-none items-center justify-center rounded-md text-xl transition-colors [-webkit-touch-callout:none] active:bg-accent"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            </div>
            {held && <EmojiNameBubble held={held} />}
        </BottomSheet>
    );
};

interface HeldEmoji {
    emoji: string;
    name: string;
    x: number;
    y: number;
}

const BUBBLE_EDGE_MARGIN_PX = 8;

export const clampBubbleLeft = (centerX: number, width: number, viewportWidth: number): number => {
    const max = viewportWidth - BUBBLE_EDGE_MARGIN_PX - width;
    return Math.max(BUBBLE_EDGE_MARGIN_PX, Math.min(centerX - width / 2, max));
};

const EmojiNameBubble = ({ held }: { held: HeldEmoji }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [left, setLeft] = useState<number | null>(null);

    useLayoutEffect(() => {
        setLeft(clampBubbleLeft(held.x, ref.current?.offsetWidth ?? 0, window.innerWidth));
    }, [held]);

    return createPortal(
        <div
            ref={ref}
            aria-hidden
            data-testid="emoji-name-bubble"
            style={{ left: left ?? 0, top: held.y - 6, visibility: left === null ? 'hidden' : 'visible' }}
            className="pointer-events-none fixed z-[60] flex max-w-[calc(100vw-16px)] -translate-y-full items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-sm text-background shadow-lg"
        >
            <span className="text-lg">{held.emoji}</span>
            <span className="truncate">{held.name}</span>
        </div>,
        document.body
    );
};
