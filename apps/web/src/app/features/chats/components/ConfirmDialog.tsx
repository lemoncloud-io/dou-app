import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
    isPending?: boolean;
    variant?: 'danger' | 'warning';
}

export const ConfirmDialog = ({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    onConfirm,
    isPending = false,
    variant = 'danger',
}: ConfirmDialogProps) => {
    const { t } = useTranslation();

    if (!open) return null;

    const handleBackdropClick = () => {
        if (!isPending) onOpenChange(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={handleBackdropClick} />

            {/* Dialog */}
            <div className="relative mx-4 w-full max-w-[288px] overflow-hidden rounded-xl bg-background">
                {/* Content */}
                <div className="flex flex-col items-center gap-[26px] pt-7">
                    {/* Text */}
                    <div className="flex flex-col items-center gap-2 px-[18px] text-center">
                        <h2 className="text-base font-semibold leading-[1.5] text-foreground">{title}</h2>
                        <p
                            className={`text-sm font-medium leading-[1.5] ${
                                variant === 'danger' ? 'text-destructive' : 'text-muted-foreground'
                            }`}
                        >
                            {description}
                        </p>
                    </div>

                    {/* Buttons */}
                    <div className="flex w-full">
                        <button
                            onClick={() => onOpenChange(false)}
                            disabled={isPending}
                            className="flex h-[52px] flex-1 items-center justify-center border-t border-r border-border text-[15px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isPending}
                            className={`flex h-[52px] flex-1 items-center justify-center border-t border-border text-[15px] font-semibold transition-colors hover:bg-muted disabled:opacity-50 ${
                                variant === 'danger' ? 'text-destructive' : 'text-foreground'
                            }`}
                        >
                            {isPending ? (
                                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                                confirmLabel
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
