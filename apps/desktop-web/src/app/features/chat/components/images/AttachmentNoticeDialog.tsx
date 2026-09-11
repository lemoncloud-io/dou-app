import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

import type { AttachmentRejection } from '../../utils';

interface AttachmentNoticeDialogProps {
    notice: AttachmentRejection | null;
    onDismiss: () => void;
}

/**
 * The one-button notice a refused attachment raises (Figma "#이미지 업로드 초과 / 중복 /
 * 업로드 에러"): a compact centred card, the message, and 확인. An unsupported type is
 * the only error-coloured one — the other two are limits, not failures.
 */
export const AttachmentNoticeDialog = ({ notice, onDismiss }: AttachmentNoticeDialogProps) => {
    const { t } = useTranslation();
    return (
        <AlertDialog open={notice !== null} onOpenChange={open => !open && onDismiss()}>
            <AlertDialogContent className="w-[311px] max-w-[calc(100vw-32px)] gap-0 overflow-hidden rounded-2xl border-0 p-0">
                <div className="flex flex-col items-center gap-2 px-6 pb-5 pt-6 text-center">
                    <AlertDialogTitle
                        className={cn(
                            'whitespace-pre-line text-[16px] font-semibold leading-snug tracking-[-0.01em]',
                            notice === 'unsupported' ? 'text-destructive' : 'text-foreground'
                        )}
                    >
                        {notice && t(`chat.attach.notice.${notice}.title`)}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="whitespace-pre-line text-[13px] leading-snug text-label">
                        {notice && t(`chat.attach.notice.${notice}.body`)}
                    </AlertDialogDescription>
                </div>
                <AlertDialogAction
                    onClick={onDismiss}
                    className="h-auto rounded-none border-t border-hairline bg-transparent py-3.5 text-[15px] font-semibold text-[#007AFF] shadow-none hover:bg-accent"
                >
                    {t('chat.attach.notice.ok')}
                </AlertDialogAction>
            </AlertDialogContent>
        </AlertDialog>
    );
};
