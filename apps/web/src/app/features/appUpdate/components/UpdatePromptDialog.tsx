import { useTranslation } from 'react-i18next';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogCancel,
    AlertDialogAction,
} from '@chatic/ui-kit/components/ui/alert-dialog';

interface UpdatePromptDialogProps {
    open: boolean;
    onDismiss: () => void;
    onUpdate: () => void;
}

/** Optional, once-per-version "a new update is available" prompt. Not a forced update. */
export const UpdatePromptDialog = ({ open, onDismiss, onUpdate }: UpdatePromptDialogProps) => {
    const { t } = useTranslation();

    return (
        <AlertDialog open={open} onOpenChange={isOpen => !isOpen && onDismiss()}>
            <AlertDialogContent className="max-w-[288px] gap-0 overflow-hidden rounded-[12px] border-0 p-0 shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)]">
                <div className="flex flex-col items-center gap-[22px] pt-[22px]">
                    <div className="flex flex-col items-center gap-2 px-[22px] text-center">
                        <AlertDialogTitle className="text-[18px] font-semibold leading-[1.5] text-foreground">
                            {t('appUpdate.title')}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[16px] font-medium leading-[1.45] tracking-[-0.16px] text-dialog-subtitle">
                            {t('appUpdate.description')}
                        </AlertDialogDescription>
                    </div>

                    <div className="flex w-full">
                        {/* No explicit onClick: Radix's Cancel-close already triggers onOpenChange(false)
                            above, which calls onDismiss — an onClick here would double-invoke it. */}
                        <AlertDialogCancel className="mt-0 flex h-[52px] flex-1 items-center justify-center rounded-none border-0 border-r border-t border-border bg-transparent text-[16px] font-medium text-dialog-subtitle transition-colors hover:bg-muted">
                            {t('appUpdate.later')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={onUpdate}
                            className="flex h-[52px] flex-1 items-center justify-center rounded-none border-0 border-t border-border bg-transparent text-[16px] font-semibold text-foreground transition-colors hover:bg-muted"
                        >
                            {t('appUpdate.update')}
                        </AlertDialogAction>
                    </div>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
};
