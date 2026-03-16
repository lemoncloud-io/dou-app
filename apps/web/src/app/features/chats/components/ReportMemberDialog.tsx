import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogCancel,
    AlertDialogAction,
} from '@chatic/ui-kit/components/ui/alert-dialog';
import { Textarea } from '@chatic/ui-kit/components/ui/textarea';
import { cn } from '@chatic/ui-kit';

interface ReportMemberDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    memberName: string;
    onConfirm: (reason: string) => void;
    isPending?: boolean;
}

export const ReportMemberDialog = ({
    open,
    onOpenChange,
    memberName,
    onConfirm,
    isPending = false,
}: ReportMemberDialogProps) => {
    const { t } = useTranslation();
    const [reason, setReason] = useState('');

    const handleOpenChange = (isOpen: boolean) => {
        if (!isPending) {
            onOpenChange(isOpen);
            if (!isOpen) {
                setReason('');
            }
        }
    };

    const handleConfirm = () => {
        onConfirm(reason);
    };

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogContent
                className="max-w-[288px] gap-0 overflow-hidden rounded-xl border-0 p-0"
                data-prevent-back-close={isPending ? '' : undefined}
            >
                <div className="flex flex-col gap-4 px-[18px] pt-7 pb-4">
                    <div className="flex flex-col items-center gap-2 text-center">
                        <AlertDialogTitle className="text-base font-semibold leading-[1.5] text-foreground">
                            {t('chat.settings.reportDialog.title')}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm font-medium leading-[1.5] text-muted-foreground">
                            {t('chat.settings.reportDialog.description', { name: memberName })}
                        </AlertDialogDescription>
                    </div>

                    <Textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder={t('chat.settings.reportDialog.reasonPlaceholder')}
                        className="min-h-[100px] w-full resize-none rounded-lg border-border bg-background text-sm"
                        disabled={isPending}
                    />
                </div>

                <div className="flex w-full">
                    <AlertDialogCancel
                        disabled={isPending}
                        className="mt-0 flex h-[52px] flex-1 items-center justify-center rounded-none border-0 border-r border-t border-border bg-transparent text-[15px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                        {t('common.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleConfirm}
                        disabled={isPending || !reason.trim()}
                        className={cn(
                            'flex h-[52px] flex-1 items-center justify-center rounded-none border-0 border-t border-border bg-transparent text-[15px] font-semibold transition-colors hover:bg-muted disabled:opacity-50',
                            'text-destructive'
                        )}
                    >
                        {isPending ? (
                            <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                            t('chat.settings.reportDialog.confirm')
                        )}
                    </AlertDialogAction>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
};
