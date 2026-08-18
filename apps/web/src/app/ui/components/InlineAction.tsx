import { cn } from '@chatic/lib/utils';

export interface InlineActionProps {
    label: string;
    onClick: () => void;
    enabled: boolean;
    /** Blue is the actionable accent; the default dark reads as a secondary action. */
    accent?: boolean;
}

/**
 * In-field / helper-row text link — what `TextField`'s `trailing` and `helperTrailing` slots are
 * documented to hold (인증 요청 · 재전송 · 시간 연장).
 *
 * Lives here rather than beside one verification flow because both of them need the identical
 * control, and a design-system slot filled two different ways is how the two screens drift apart.
 */
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
