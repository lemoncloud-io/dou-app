import { cn } from '@chatic/ui-kit';

export interface InlineActionProps {
    label: string;
    onClick: () => void;
    enabled: boolean;
    accent?: boolean;
}

export const InlineAction = ({ label, onClick, enabled, accent = false }: InlineActionProps) => (
    <button
        type="button"
        onClick={onClick}
        disabled={!enabled}
        className={cn(
            'whitespace-nowrap text-[14px] font-medium underline',
            !enabled ? 'text-placeholder' : accent ? 'text-point-blue' : 'text-foreground'
        )}
    >
        {label}
    </button>
);
