import { cn } from '@chatic/lib/utils';

export interface GuideBullet {
    title: string;
    /** Second line. Present on the PRO benefits, absent on the FREE limitations. */
    description?: string;
}

interface GuideBulletListProps {
    items: GuideBullet[];
    /**
     * `muted` for the FREE card, whose rows are limitations and are deliberately de-emphasised;
     * `emphasis` for the PRO card, whose rows are the selling points.
     */
    tone?: 'muted' | 'emphasis';
}

/**
 * Bullet list of the cloud guide cards. Uses an 8px dot marker rather than kit's `BenefitItem`
 * (which leads with a 32px icon slot) — the Figma rows here are dot + text only (3519-29642).
 */
export const GuideBulletList = ({ items, tone = 'muted' }: GuideBulletListProps) => {
    const isEmphasis = tone === 'emphasis';

    return (
        <ul className="flex flex-col gap-2.5">
            {items.map(item => (
                <li key={item.title} className="flex items-start gap-2.5">
                    <span
                        aria-hidden
                        className={cn(
                            'mt-1.5 size-2 shrink-0 rounded-full',
                            isEmphasis ? 'bg-foreground' : 'bg-input-border'
                        )}
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <span
                            className={cn(
                                'text-[15px] leading-[1.35] tracking-[-0.075px]',
                                isEmphasis ? 'font-semibold text-foreground' : 'font-medium text-description'
                            )}
                        >
                            {item.title}
                        </span>
                        {item.description && (
                            <span className="text-[14px] font-normal leading-[1.35] tracking-[-0.07px] text-description">
                                {item.description}
                            </span>
                        )}
                    </div>
                </li>
            ))}
        </ul>
    );
};
