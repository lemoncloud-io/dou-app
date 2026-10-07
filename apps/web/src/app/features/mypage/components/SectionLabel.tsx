interface SectionLabelProps {
    title: string;
    /** Right-aligned figure in the same weight as the title (e.g. `1 / 2`). */
    figure?: string;
}

/** The design's section label row on the cloud management screens: a bold title, an optional figure. */
export const SectionLabel = ({ title, figure }: SectionLabelProps) => (
    <div className="flex items-center gap-3 px-4 py-2">
        <span className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-[18px] tracking-[-0.08px] text-foreground">
            {title}
        </span>
        {figure && <span className="shrink-0 text-[16px] font-semibold leading-[18px] text-foreground">{figure}</span>}
    </div>
);
