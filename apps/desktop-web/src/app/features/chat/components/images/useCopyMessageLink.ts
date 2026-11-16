import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import type { DomainChat } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { buildMessageLink } from '../../utils/messageLink';
import { toastFailure } from '../../../../shared';

/**
 * "Copy link" for a message's file or image: puts the app link to the message on the clipboard. Absent
 * for a message the server has not numbered yet, which has no address to link to.
 */
export const useCopyMessageLink = ({
    chatNo,
    channelId,
    parentId,
}: Pick<DomainChat, 'chatNo' | 'channelId' | 'parentId'>): (() => void) | undefined => {
    const { t } = useTranslation();
    if (chatNo == null || !channelId) return undefined;
    return () => {
        // Read on the click: the cloud and place the reader is in now are the message's. The Default
        // Cloud has no cloud id in the session; it is named by the sentinel the home screen switches to,
        // so the link still leaves another cloud for it.
        const { cloud } = runtime.session.getGlobalSessionContext();
        const link = buildMessageLink({
            cloudId: cloud.cloudId || 'default',
            placeId: cloud.siteId ?? '',
            channelId,
            chatNo,
            ...(parentId ? { rootId: parentId } : {}),
        });
        void navigator.clipboard.writeText(link).then(
            () => toast({ description: t('chat.file.linkCopied') }),
            (error: unknown) => toastFailure(t('chat.file.copyLinkFailed'), error)
        );
    };
};
