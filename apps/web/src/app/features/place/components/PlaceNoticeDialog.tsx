import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';
import { cn } from '@chatic/ui-kit';

import { PLACE_DIALOG_TEXT } from './PlaceConfirmDialog';

interface PlaceNoticeDialogProps {
    open: boolean;
    /** May hold a line break; it is kept. */
    title: string;
    /** The red body under the title. Without one, the title is all the dialog says. */
    description?: string;
    confirmLabel: string;
    /** The only way out — there is no cancel, and the backdrop and Escape do not close it. */
    onConfirm: () => void;
}

/**
 * A one-button notice about a place: "you left it" and "its owner deleted it". Same frame as the
 * confirm dialogs on the place screens — 311 px card, title over an optional red body, one full-width
 * action — but nothing to decide, so the action is the only exit.
 */
export const PlaceNoticeDialog = ({ open, title, description, confirmLabel, onConfirm }: PlaceNoticeDialogProps) => (
    <AlertDialog open={open}>
        <AlertDialogContent
            className="gap-0 overflow-hidden rounded-[12px] border-0 p-0 shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)]"
            onEscapeKeyDown={event => event.preventDefault()}
        >
            <div className="flex flex-col items-center gap-[22px] pt-[22px]">
                <div className="flex flex-col items-center gap-2 px-[22px] text-center">
                    <AlertDialogTitle
                        className={cn('text-[18px] font-semibold leading-[1.5] text-foreground', PLACE_DIALOG_TEXT)}
                    >
                        {title}
                    </AlertDialogTitle>
                    <AlertDialogDescription
                        className={cn(
                            'min-w-0 text-[16px] font-medium leading-[1.45] tracking-[-0.08px] text-destructive',
                            PLACE_DIALOG_TEXT,
                            description ? '' : 'sr-only'
                        )}
                    >
                        {description || title}
                    </AlertDialogDescription>
                </div>
                <div className="flex w-full">
                    <AlertDialogAction
                        onClick={onConfirm}
                        className="mt-0 flex h-[52px] flex-1 items-center justify-center rounded-none border-0 border-t border-border bg-transparent text-[16px] font-semibold text-foreground transition-colors hover:bg-muted"
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </div>
            </div>
        </AlertDialogContent>
    </AlertDialog>
);
