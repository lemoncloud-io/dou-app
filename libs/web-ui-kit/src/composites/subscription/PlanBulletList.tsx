import { cn } from '@chatic/ui-kit';

export interface PlanBullet {
    title: string;
    description?: string;
}

export interface PlanBulletListProps {
    items: PlanBullet[];
    tone?: 'muted' | 'emphasis';
    className?: string;
}

export const PlanBulletList = ({ items, tone = 'muted', className }: PlanBulletListProps) => {
    const isEmphasis = tone === 'emphasis';

    return (
        <ul className={cn('flex flex-col gap-2.5', className)}>
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
                                'leading-[1.35]',
                                isEmphasis
                                    ? 'text-[16px] font-semibold tracking-[-0.08px] text-foreground'
                                    : 'text-[15px] font-medium tracking-[-0.075px] text-description'
                            )}
                        >
                            {item.title}
                        </span>
                        {item.description && (
                            <span className="text-[14px] font-medium leading-[1.35] tracking-[-0.07px] text-description">
                                {item.description}
                            </span>
                        )}
                    </div>
                </li>
            ))}
        </ul>
    );
};
