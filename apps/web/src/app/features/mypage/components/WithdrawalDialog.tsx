import { useTranslation } from 'react-i18next';

interface WithdrawalDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export const WithdrawalDialog = ({ isOpen, onClose, onConfirm }: WithdrawalDialogProps) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            {/* Dialog */}
            <div className="relative mx-4 w-full max-w-[288px] overflow-hidden rounded-xl bg-background">
                {/* Content */}
                <div className="flex flex-col items-center gap-[26px] pt-7">
                    {/* Text */}
                    <div className="flex flex-col items-center gap-2 px-[18px] text-center">
                        <h2 className="text-base font-semibold leading-[1.5] text-foreground">
                            {t('mypage.withdrawalDialog.title')}
                        </h2>
                        <p className="text-sm font-medium leading-[1.5] text-destructive">
                            {t('mypage.withdrawalDialog.description')}
                        </p>
                    </div>

                    {/* Buttons */}
                    <div className="flex w-full">
                        <button
                            onClick={onClose}
                            className="flex h-[52px] flex-1 items-center justify-center border-r border-t border-border text-[15px] font-medium text-muted-foreground transition-colors hover:bg-muted"
                        >
                            {t('mypage.withdrawalDialog.cancel')}
                        </button>
                        <button
                            onClick={onConfirm}
                            className="flex h-[52px] flex-1 items-center justify-center border-t border-border text-[15px] font-semibold text-destructive transition-colors hover:bg-muted"
                        >
                            {t('mypage.withdrawalDialog.confirm')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
