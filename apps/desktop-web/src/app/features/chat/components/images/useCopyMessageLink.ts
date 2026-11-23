import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';
import type { DomainChat } from '@chatic/runtime';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { buildMessageLink } from '../../utils/messageLink';
import { toastFailure } from '../../../../shared';

export const useCopyMessageLink = ({
    chatNo,
    channelId,
    parentId,
}: Pick<DomainChat, 'chatNo' | 'channelId' | 'parentId'>): (() => void) | undefined => {
    const { t } = useTranslation();
    if (chatNo == null || !channelId) return undefined;
    return () => {
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
