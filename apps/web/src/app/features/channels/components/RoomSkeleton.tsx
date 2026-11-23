const ROWS: Array<{ mine: boolean; width: string }> = [
    { mine: false, width: '52%' },
    { mine: true, width: '38%' },
    { mine: false, width: '64%' },
    { mine: false, width: '44%' },
    { mine: true, width: '56%' },
    { mine: true, width: '32%' },
    { mine: false, width: '48%' },
];

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
