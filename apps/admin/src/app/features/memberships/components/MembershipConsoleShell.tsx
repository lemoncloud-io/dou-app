interface MembershipConsoleShellProps {
    header: React.ReactNode;
    rail: React.ReactNode;
    main: React.ReactNode;
    detail: React.ReactNode;
    footer: React.ReactNode;
}

export const MembershipConsoleShell = ({ header, rail, main, detail, footer }: MembershipConsoleShellProps) => (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3">{header}</div>
        <div className="flex min-h-0 flex-1">
            <div className="hidden xl:flex xl:min-h-0">{rail}</div>
            <section className="flex min-w-0 flex-1 flex-col overflow-auto">{main}</section>
            {detail}
        </div>
        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            {footer}
        </div>
    </div>
);
