import { type JSX, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, type ButtonVariant, Dialog } from './ui';

/**
 * A question with one action. Leave out `onConfirm` for a notice that only closes (the "cannot do
 * that" dialogs); `pending` disables both buttons while the action runs, `confirmDisabled` only the
 * action — for a dialog whose fields are not filled in yet.
 */
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
                        <Button variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
                            {cancelLabel ?? t('subscription.common.actions.cancel')}
                        </Button>
                        <Button variant={confirmVariant} disabled={pending || confirmDisabled} onClick={onConfirm}>
                            {confirmLabel ?? t('subscription.common.actions.confirm')}
                        </Button>
                    </>
                ) : (
                    <Button onClick={() => onOpenChange(false)}>
                        {confirmLabel ?? t('subscription.common.actions.confirm')}
                    </Button>
                )
            }
        >
            {children}
        </Dialog>
    );
};
