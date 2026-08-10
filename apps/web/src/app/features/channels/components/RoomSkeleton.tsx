// A fixed, alternating shape rather than a random one: the placeholder must look the same every
// time a room opens, or the skeleton itself becomes the flicker it exists to remove. Widths are in
// the range real bubbles land in, so the swap to messages does not jump.
const ROWS: Array<{ mine: boolean; width: string }> = [
    { mine: false, width: '52%' },
    { mine: true, width: '38%' },
    { mine: false, width: '64%' },
    { mine: false, width: '44%' },
    { mine: true, width: '56%' },
    { mine: true, width: '32%' },
    { mine: false, width: '48%' },
];

/**
 * Stand-in for the message list while a room is still resolving.
 *
 * Replaces a centered spinner, which said "something is happening" but not "a chat room is
 * opening" — and left the translucent header with nothing behind it, so the glass had nothing to
 * frost until the first messages landed.
 *
 * Laid out top-down like the real list reads, not bottom-anchored: at this point there is no way
 * to know whether the room has enough history to fill the viewport, and starting from the top is
 * where a short room ends up anyway.
 */
export const RoomSkeleton = () => (
    <div aria-hidden className="flex flex-col gap-3 px-4">
        {ROWS.map((row, index) => (
            <div key={index} className={`flex ${row.mine ? 'justify-end' : 'items-end gap-2'}`}>
                {!row.mine && <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />}
                <div className="h-9 animate-pulse rounded-[18px] bg-muted" style={{ width: row.width }} />
            </div>
        ))}
    </div>
);
