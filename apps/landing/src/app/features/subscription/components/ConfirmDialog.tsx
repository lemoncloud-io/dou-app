import { type JSX, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, type ButtonVariant, Dialog } from './ui';

export const ConfirmDialog = ({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    confirmVariant = 'primary',
    pending = false,
    confirmDisabled = false,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: ReactNode;
    description?: ReactNode;
    confirmLabel?: ReactNode;
    cancelLabel?: ReactNode;
    onConfirm?: () => void;
    confirmVariant?: ButtonVariant;
    pending?: boolean;
    confirmDisabled?: boolean;
    children?: ReactNode;
}): JSX.Element => {
    const { t } = useTranslation();
    return (
        <Dialog
            open={open}
            onOpenChange={next => !pending && onOpenChange(next)}
            title={title}
            description={description}
            footer={
                onConfirm ? (
                    <>
                        <Button size="lg" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
                            {cancelLabel ?? t('subscription.common.actions.cancel')}
                        </Button>
                        <Button
                            size="lg"
                            variant={confirmVariant}
                            disabled={pending || confirmDisabled}
                            onClick={onConfirm}
                        >
                            {confirmLabel ?? t('subscription.common.actions.confirm')}
                        </Button>
                    </>
                ) : (
                    <Button size="lg" onClick={() => onOpenChange(false)}>
                        {confirmLabel ?? t('subscription.common.actions.confirm')}
                    </Button>
                )
            }
        >
            {children}
        </Dialog>
    );
};
