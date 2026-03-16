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
            <AlertDialogContent className="max-w-[300px] rounded-[18px]">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-center text-[17px] font-semibold">{title}</AlertDialogTitle>
                    <AlertDialogDescription className="text-center text-[14px] text-muted-foreground">
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row justify-center">
                    <AlertDialogAction
                        onClick={() => onOpenChange(false)}
                        className="h-11 flex-1 rounded-full bg-[#B0EA10] text-[15px] font-semibold text-[#222325] hover:bg-[#9DD00E]"
                    >
                        {t('limitExceeded.confirm')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
