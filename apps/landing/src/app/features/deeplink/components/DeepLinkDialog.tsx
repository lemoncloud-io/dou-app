interface DeepLinkDialogProps {
    title: string;
    subtitle?: string;
    cancelText: string;
    confirmText: string;
    onCancel: () => void;
    onConfirm: () => void;
}

/**
 * Dialog component for deep link confirmations.
 * Based on Figma design (node-id: 37:4487)
 */
export const DeepLinkDialog = ({
    title,
    subtitle,
    cancelText,
    confirmText,
    onCancel,
    onConfirm,
}: DeepLinkDialogProps): JSX.Element => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 animate-fadeIn" onClick={onCancel} />

            {/* Dialog */}
            <div className="relative bg-card rounded-xl w-[288px] flex flex-col items-center pt-7 animate-scaleIn">
                {/* Content */}
                <div className="flex flex-col gap-[26px] items-center w-full">
                    {/* Text area */}
                    <div className="flex flex-col gap-2 items-center px-[18px] text-center w-full">
                        <p className="text-foreground text-base font-semibold leading-[1.5] w-full">{title}</p>
                        {subtitle && (
                            <p className="text-muted-foreground text-sm font-medium leading-[1.5] w-full">{subtitle}</p>
                        )}
                    </div>

                    {/* Buttons */}
                    <div className="flex items-start w-full">
                        <button
                            onClick={onCancel}
                            className="flex-1 h-[52px] flex items-center justify-center border-t border-r border-border px-2 py-1.5"
                        >
                            <span className="text-muted-foreground text-[15px] font-medium leading-[1.5]">
                                {cancelText}
                            </span>
                        </button>
                        <button
                            onClick={onConfirm}
                            className="flex-1 h-[52px] flex items-center justify-center border-t border-border px-2 py-1.5"
                        >
                            <span className="text-foreground text-[15px] font-semibold leading-[1.5]">
                                {confirmText}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
