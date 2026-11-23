import { cn } from '@chatic/ui-kit';

export interface GroupLabelProps {
    label: string;
    className?: string;
}

export const GroupLabel = ({ label, className }: GroupLabelProps) => {
    return <p className={cn('px-4 py-2 text-[14px] leading-[18px] text-description', className)}>{label}</p>;
};
