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
        <div className="px-4 py-3">
            <button
                type="button"
                disabled={disabled || loading}
                onClick={onClick}
                className={cn(
                    'flex h-[50px] w-full items-center justify-center rounded-[100px] text-[16px] font-semibold transition-colors',
                    disabled || loading
                        ? 'bg-[#EAEAEC] text-[#BABCC0] dark:bg-[#3A3C40] dark:text-[#6B6D72]'
                        : 'bg-[#B0EA10] text-[#222325]'
                )}
            >
                {loading ? <Loader2 size={20} className="animate-spin" /> : label}
            </button>
        </div>
    );
};
