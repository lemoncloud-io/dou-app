/** Titled group of rows used across debug overlay tabs and screens. */
export const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">{title}</p>
        {children}
    </div>
);
