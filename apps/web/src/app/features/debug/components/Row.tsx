/** Label/value line used across debug overlay tabs and screens. */
export const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex gap-2 text-xs">
        <span className="text-muted-foreground w-28 shrink-0">{label}</span>
        <span className="font-mono break-all">{value ?? '—'}</span>
    </div>
);
