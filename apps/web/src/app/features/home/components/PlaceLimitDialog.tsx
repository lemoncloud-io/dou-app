import { Trans, useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { cn } from '@chatic/lib/utils';

interface PlaceLimitDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Places allowed per cloud — interpolated into the body copy ({{max}}). */
    maxPlaces: number;
    /**
     * Opens the ACTIVE place's settings hub, where a place can be deleted to free a slot. Omitted
     * when no place is active: the route is keyed by a site id, so there would be nothing to open —
     * the action then renders disabled rather than navigating nowhere (same idiom as HomePage's
     * '플레이스 설정' menu entry).
     */
    onManagePlaces?: () => void;
    /** Raises the subscribe-a-cloud flow. The 1-cloud quota check lives in that flow, not here. */
    onAddCloud: () => void;
}

const ACTION =
    'flex h-[52px] flex-1 items-center justify-center border-t border-input-border px-2 text-[16px] font-semibold leading-[1.5] tracking-[-0.08px] transition-colors disabled:opacity-40';

/**
 * Dialog shown when a cloud has hit its place cap (Figma 3437-16676). It replaced a plain toast so
 * the two ways out of the cap — free a slot, or get another cloud — are offered as actions instead
 * of only being described.
 *
 * Built on the shared Dialog primitive rather than web-ui-kit's `AlertDialog` composite, which is
 * otherwise the same card: the design has a top-right X, and a Radix *alert* dialog deliberately
 * has no dismiss affordance (it demands an explicit choice). Everything else — card metrics, split
 * action row, dismiss/emphasised action colours — is copied from that composite so this stays part
 * of the same "dialogue" design system.
 */
export const PlaceLimitDialog = ({
    open,
    onOpenChange,
    maxPlaces,
    onManagePlaces,
    onAddCloud,
}: PlaceLimitDialogProps) => {
    const { t } = useTranslation();

    // Close before acting: both actions leave this screen (a route change / a flow that mounts its
    // own dialogs), and an overlay left open would sit on top of whatever they open.
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
            {/* Card metrics are the design's own (311 wide, 12 radius, 40 top inset, 27.5 text inset,
                one soft ambient shadow). The close button is repositioned to the design's 12px inset —
                it comes baked into DialogContent, so it is reached through the child selector. */}
            <DialogContent className="w-[311px] max-w-[calc(100vw-3rem)] gap-0 overflow-hidden rounded-[12px] border-0 bg-surface p-0 pt-[40px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] [&>button]:right-3 [&>button]:top-3 sm:rounded-[12px]">
                <div className="flex w-full flex-col gap-[22px]">
                    <div className="flex flex-col gap-2 px-[27.5px] text-center">
                        <DialogTitle className="text-[18px] font-semibold leading-[1.5] text-foreground">
                            {t('homePage.placeLimit.title')}
                        </DialogTitle>
                        {/* `text-label` is the design's body ink exactly (--label === #53555B), not
                            `text-description` (#84888F, a step lighter than the design asks for).

                            pre-line: the copy hard-wraps in the design, so the `\n` in the translation
                            is a deliberate break rather than incidental whitespace.

                            The two emphasised phrases are marked up in the translation (<strong>) so a
                            translator controls WHICH words carry the weight — the emphasis falls on
                            different words in each language. `text-foreground` rather than the design's
                            literal #3A3C40: no semantic token carries that ink, and what the design is
                            expressing is "one step stronger than the body", which foreground-over-label
                            preserves in dark mode too (where a fixed hex would not). */}
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
