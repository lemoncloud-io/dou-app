import { useTranslation } from 'react-i18next';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

interface LimitExceededDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    type: 'place' | 'channel';
    maxCount: number;
}

export const LimitExceededDialog = ({ open, onOpenChange, type, maxCount }: LimitExceededDialogProps) => {
    const { t } = useTranslation();

    const title = type === 'place' ? t('limitExceeded.placeTitle') : t('limitExceeded.channelTitle');
    const description =
        type === 'place'
            ? t('limitExceeded.placeDescription', { max: maxCount })
            : t('limitExceeded.channelDescription', { max: maxCount });

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-[288px] gap-0 overflow-hidden rounded-[12px] border-0 p-0 shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)]">
                <AlertDialogHeader className="gap-2 px-[22px] pt-[22px] pb-0 text-center">
                    <AlertDialogTitle className="text-center text-[18px] font-semibold leading-[1.5]">
                        {title}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-center text-[16px] font-medium leading-[1.45] tracking-[-0.16px] text-dialog-subtitle">
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-[22px] flex-row justify-center sm:flex-row sm:justify-center sm:space-x-0">
                    <AlertDialogAction
                        onClick={() => onOpenChange(false)}
                        className="flex h-[52px] flex-1 items-center justify-center rounded-none border-0 border-t border-border bg-transparent text-[16px] font-semibold text-foreground transition-colors hover:bg-muted"
                    >
                        {t('limitExceeded.confirm')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
