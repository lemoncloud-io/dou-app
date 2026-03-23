import { Loader2 } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

interface FloatingButtonProps {
    label: string;
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
}

export const FloatingButton = ({ label, disabled = false, loading = false, onClick }: FloatingButtonProps) => {
    return (
        <div className="rounded-t-[16px] px-4 pb-4 pt-5">
            <button
                type="button"
                disabled={disabled || loading}
                onClick={onClick}
                className={cn(
                    'flex h-[50px] w-full items-center justify-center rounded-[100px] text-[16px] font-semibold transition-colors',
                    disabled || loading ? 'bg-input-border text-placeholder' : 'bg-primary text-primary-foreground'
                )}
            >
                {loading ? <Loader2 size={20} className="animate-spin" /> : label}
            </button>
        </div>
    );
};
