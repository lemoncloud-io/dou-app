import { cn } from '@chatic/lib/utils';

export interface GroupLabelProps {
    label: string;
    className?: string;
}

/**
 * Small muted group label above a settings list section (e.g. "Chat room settings", "Room
 * friends"). Distinct from SectionHeader, which is the larger bold list title.
 */
export const GroupLabel = ({ label, className }: GroupLabelProps) => {
    return <p className={cn('px-4 py-2 text-[14px] leading-[18px] text-description', className)}>{label}</p>;
};
