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

/**
 * Category-tabbed emoji grid as a bottom sheet — the mobile port of desktop's
 * EmojiPicker popover. Picks are remembered in the device-local LRU ("recently used"
 * tab). No external emoji DB — categories are the curated sets in utils/emoji.ts,
 * kept identical to desktop so the two apps offer the same reaction set (ADR-0093).
 *
 * Pressing and holding an emoji names it — the touch stand-in for desktop's hover hint — in a
 * bubble above the finger, and letting go after that does not pick it, so holding is a safe way
 * to ask "what is this?" before choosing.
 */
export const EmojiPickerSheet = ({ open, onOpenChange, onPick }: EmojiPickerSheetProps) => {
    const { t } = useTranslation();
    // Not suspending: the `emoji` namespace is fetched on first use, and the grid must not
    // blank out while it arrives — until then a hold simply has no name to show.
    const { t: tEmoji } = useTranslation('emoji', { useSuspense: false });
    const recent = useRecentEmojiStore(s => s.recent);
    const remember = useRecentEmojiStore(s => s.remember);
    const [categoryKey, setCategoryKey] = useState(EMOJI_CATEGORIES[0].key);

    const [held, setHeld] = useState<HeldEmoji | null>(null);
    const timerRef = useRef<number | null>(null);
    const pressOriginRef = useRef<{ x: number; y: number } | null>(null);
    // A hold still ends in a `click` on release; this stops that click from picking.
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
    // A sheet closed mid-hold (Android back, a programmatic close) never delivers the release to
    // its unmounted button, so the hold would otherwise come back with the sheet.
    useEffect(() => {
        if (!open) endHold();
    }, [open]);

    const nameOf = (emoji: string) => tEmoji(emojiNameKey(emoji), { defaultValue: '' });

    /** Shows `emoji`'s name over `target`; false when it has none, so the release still picks. */
    const showName = (target: HTMLElement, emoji: string): boolean => {
        const name = nameOf(emoji);
        if (!name) return false;
        longPressFiredRef.current = true;
        // Measured when the hold matures, not at pointer-down, so the bubble anchors to where
        // the emoji is now.
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

    // A touch captures the pointer, so a scroll that starts on an emoji fires neither
    // `pointerleave` nor `pointercancel` until the finger lifts. Drift past a fingertip's wobble is
    // what tells a scroll from a hold; without this a slow flick would name whatever it began on.
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

    // The OS's own long press arrives as `contextmenu`. On the Android emulator it came ~500 ms after
    // pointer-down, just after our timer, but its timeout is a system setting a user can shorten — so
    // it is a trigger, not just a menu to stop. It is also what a mouse right-click sends.
    const holdFromContextMenu = (event: ReactMouseEvent<HTMLButtonElement>, emoji: string) => {
        event.preventDefault();
        clearTimer();
        showName(event.currentTarget, emoji);
    };

    const pick = (event: ReactMouseEvent<HTMLButtonElement>, emoji: string) => {
        // `detail === 0` is a keyboard or switch-control activation: no pointer went down, so a
        // flag left by a hold that ended without a click must not swallow it.
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
            // Half the screen, always: the sheet's height must not follow its content (see the
            // grid below) and half a screen leaves the message it reacts to still visible.
            className="h-[50vh]"
        >
            <div className="flex h-full flex-col gap-2 px-4 pb-2">
                {/* Scrolls sideways rather than shrinking the tabs: nine categories plus the
                    recents tab are 360px of 36px targets on a 343px-wide sheet, and squeezing
                    them to fit would take the tap targets below the 36px minimum. */}
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
                {/* Fills the sheet's fixed height rather than sizing to its rows: the categories
                    hold different counts (recent can hold one), so a height that follows the
                    content made the sheet jump every time a tab was switched. The grid keeps its
                    rows at the top and scrolls the overflow. */}
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
    /** Viewport x of the held emoji's centre. */
    x: number;
    /** Viewport y of the held emoji's top edge. */
    y: number;
}

/** Kept clear of the screen edge, so a bubble over the first or last column is not cut off. */
const BUBBLE_EDGE_MARGIN_PX = 8;

/** Left edge for a bubble of `width` centred on `centerX`, kept inside the viewport margins. */
export const clampBubbleLeft = (centerX: number, width: number, viewportWidth: number): number => {
    const max = viewportWidth - BUBBLE_EDGE_MARGIN_PX - width;
    return Math.max(BUBBLE_EDGE_MARGIN_PX, Math.min(centerX - width / 2, max));
};

/**
 * The name of the emoji being held, floated above it.
 *
 * Portalled to `body` because the sheet's content is transformed (it slides and drags), and a
 * `fixed` element inside a transformed ancestor is positioned against that ancestor rather than
 * the viewport. Purely visual — the button already carries the name as its accessible label.
 */
const EmojiNameBubble = ({ held }: { held: HeldEmoji }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [left, setLeft] = useState<number | null>(null);

    // Centred on the emoji, then nudged inward where that would cross a screen edge. That needs
    // the rendered width, so the bubble is placed after layout and hidden until then.
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
