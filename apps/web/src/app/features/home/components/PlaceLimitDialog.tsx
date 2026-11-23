import { Trans, useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { cn } from '@chatic/ui-kit';

interface PlaceLimitDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    maxPlaces: number;
    onManagePlaces?: () => void;
    onAddCloud: () => void;
}

const ACTION =
    'flex h-[52px] flex-1 items-center justify-center border-t border-input-border px-2 text-[16px] font-semibold leading-[1.5] tracking-[-0.08px] transition-colors disabled:opacity-40';

export const PlaceLimitDialog = ({
    open,
    onOpenChange,
    maxPlaces,
    onManagePlaces,
    onAddCloud,
}: PlaceLimitDialogProps) => {
    const { t } = useTranslation();

    const handleManagePlaces = () => {
        onOpenChange(false);
        onManagePlaces?.();
    };

    const handleAddCloud = () => {
        onOpenChange(false);
        onAddCloud();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                closeLabel={t('common.close')}
                className="gap-0 overflow-hidden rounded-[12px] border-0 bg-surface p-0 pt-[40px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] [&>button]:right-3 [&>button]:top-3 sm:rounded-[12px]"
            >
                <div className="flex w-full flex-col gap-[22px]">
                    <div className="flex flex-col gap-2 px-[27.5px] text-center">
                        <DialogTitle className="text-[18px] font-semibold leading-[1.5] text-foreground">
                            {t('homePage.placeLimit.title')}
                        </DialogTitle>
                        <DialogDescription
                            asChild
                            className="whitespace-pre-line text-[16px] font-medium leading-[1.45] tracking-[-0.08px] text-label"
                        >
                            <p>
                                <Trans
                                    i18nKey="homePage.placeLimit.description"
                                    values={{ max: maxPlaces }}
                                    components={{
                                        strong: <strong className="font-bold text-foreground" />,
                                    }}
                                />
                            </p>
                        </DialogDescription>
                    </div>

                    <div className="flex w-full">
                        <button
                            type="button"
                            onClick={handleManagePlaces}
                            disabled={!onManagePlaces}
                            className={cn(ACTION, 'border-r text-label')}
                        >
                            {t('homePage.placeLimit.manage')}
                        </button>
                        <button type="button" onClick={handleAddCloud} className={cn(ACTION, 'text-foreground')}>
                            {t('homePage.placeLimit.addCloud')}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
