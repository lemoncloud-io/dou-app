import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';
import { toast } from '@chatic/ui-kit';

import type { ChatMentionBody, DomainChat } from '@chatic/runtime';

import { useChatMutations } from '../../../shared/hooks/useChatMutations';
import { isUnsentImageMessage } from '../utils';
import { toastFailure } from '../../../shared';

export interface ComposerSendTarget {
    cid: string;
    channelId: string;
    parentId?: string;
}

export const useComposerSend = ({ cid, channelId, parentId }: ComposerSendTarget) => {
    const { t } = useTranslation();
    const { sendMessage, retryMessage, discardMessage } = useChatMutations();
    const {
        sendImages,
        retry: retryImages,
        canRetry: canRetryImages,
        discard: discardImages,
        cancel: cancelImages,
    } = runtime.data.useSendImages({ cid, channelId, ...(parentId ? { parentId } : {}), put: runtime.files.put });

    const failed = useCallback((error: unknown) => toastFailure(t('toast.messageFailed'), error), [t]);

    const send = useCallback(
        (content: string, files: readonly File[], mention?: ChatMentionBody) => {
            if (files.length > 0) {
                void sendImages([...files], { content, ...(mention ? { mention } : {}) }).catch(failed);
                return;
            }
            if (content) {
                void sendMessage(cid, {
                    channelId,
                    content,
                    ...(parentId ? { parentId } : {}),
                    ...(mention ? { mention } : {}),
                }).catch(failed);
            }
        },
        [cid, channelId, parentId, sendImages, sendMessage, failed]
    );

    const retry = useCallback(
        (message: DomainChat) => {
            if (!isUnsentImageMessage(message)) {
                void retryMessage(message).catch(failed);
                return;
            }
            const filesGone = !canRetryImages(message.id);
            void retryImages(message.id).then(retried => {
                if (!retried && filesGone) toast({ variant: 'destructive', description: t('chat.image.retryGone') });
            }, failed);
        },
        [canRetryImages, retryImages, retryMessage, failed, t]
    );

    const canRetry = useCallback(
        (message: DomainChat) => !isUnsentImageMessage(message) || canRetryImages(message.id),
        [canRetryImages]
    );

    const discard = useCallback(
        (message: DomainChat) => {
            if (isUnsentImageMessage(message)) discardImages(message.id);
            void discardMessage(message);
        },
        [discardImages, discardMessage]
    );

    const cancelUpload = useCallback(
        (message: DomainChat) => {
            if (isUnsentImageMessage(message)) cancelImages(message.id);
        },
        [cancelImages]
    );

    return { send, retry, canRetry, discard, cancelUpload };
};
