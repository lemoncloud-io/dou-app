import { cn } from '@chatic/ui-kit';

export interface SystemMessageProps {
    title: string;
    description?: string;
    className?: string;
}

export const SystemMessage = ({ title, description, className }: SystemMessageProps) => {
    return (
        <div className={cn('flex w-full flex-col items-start gap-1.5 px-4 pb-2 pt-2.5', className)}>
            <p className="text-[18px] font-semibold leading-[26px] tracking-[-0.09px] text-foreground">{title}</p>
            {description && <p className="text-[16px] leading-[22px] tracking-[-0.08px] text-label">{description}</p>}
        </div>
    );
};
