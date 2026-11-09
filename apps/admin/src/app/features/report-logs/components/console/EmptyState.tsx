/**
 * `components/report-logs/console/EmptyState.tsx`
 * - An empty screen that says what to do next, not just that there is nothing.
 */
interface EmptyStateProps {
    title: string;
    hint?: string;
    action?: { label: string; onClick: () => void };
}

export const EmptyState = ({ title, hint, action }: EmptyStateProps) => (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-[15px] font-medium text-foreground">{title}</p>
        {hint && <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{hint}</p>}
        {action && (
            <button
                type="button"
                onClick={action.onClick}
                className="rounded-lg border border-primary px-4 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
            >
                {action.label}
            </button>
        )}
    </div>
);
