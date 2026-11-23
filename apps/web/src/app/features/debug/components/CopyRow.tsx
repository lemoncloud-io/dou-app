import type { ReactNode } from 'react';

import { Check, Copy, TriangleAlert } from 'lucide-react';

import { useCopyFeedback } from '../hooks/useCopyFeedback';

export const CopyRow = ({
    label,
    value,
    copyValue,
}: {
    label: string;
    value: ReactNode;
    copyValue: string | null | undefined;
}) => {
    const { state, copy } = useCopyFeedback();
    const Icon = state === 'copied' ? Check : state === 'failed' ? TriangleAlert : Copy;

    return (
        <button
            type="button"
            disabled={!copyValue}
            onClick={() => void copy(copyValue)}
            aria-live="polite"
            className="flex items-start justify-between gap-2 text-left"
        >
            <dt className="w-[92px] shrink-0 text-[12px] text-muted-foreground">{label}</dt>
            <dd className="flex-1 break-all text-[12px] font-medium text-foreground">{value}</dd>
            {copyValue && (
                <Icon
                    size={13}
                    className={`mt-0.5 shrink-0 ${state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
                />
            )}
        </button>
    );
};
