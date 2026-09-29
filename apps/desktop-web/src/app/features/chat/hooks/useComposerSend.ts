import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { xhrPut } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import type { DomainChat } from '@chatic/data';

import { useChatMutations } from '../../../shared/hooks/useChatMutations';
import { isUnsentImageMessage } from '../utils';

export interface ComposerSendTarget {
    /** The room's own cloud — the channel row's `cid` (the relay's for a relay channel). */
    cid: string;
    channelId: string;
    /** Thread-reply target — the root's full id. Omit for a top-level message. */
    parentId?: string;
}

/**
 * What the composer's send button does in a room or a thread: the text goes out as a message at the
 * press, and the tray's pictures as one image message after it.
 *
 * That order is the design's — text above its pictures. It also falls out of the wire: the image
 * message reaches the server only once its uploads are done, so it takes the higher number. The two
 * fail apart: a picture send that fails keeps its own Failed row, and the text is already out.
 *
 * Both are addressed to the room as it was at the press, whichever room is on screen when they land.
 * The desktop shell has no native transfer, so the bytes go through the page's own PUT.
 *
 * Retry, Delete and whether Retry is offered also start here, because a failed picture message is
 * not a failed text message: it is retried with the pictures this page still holds, on the same
 * row, and its row's files are let go when it is deleted.
 */
export const useComposerSend = ({ cid, channelId, parentId }: ComposerSendTarget) => {
    const { t } = useTranslation();
    const { sendMessage, retryMessage, discardMessage } = useChatMutations();
    const {
        sendImages,
        retry: retryImages,
        canRetry: canRetryImages,
        discard: discardImages,
    } = runtime.data.useSendImages({ cid, channelId, ...(parentId ? { parentId } : {}), put: xhrPut });

    const send = useCallback(
        (content: string, files: readonly File[]) => {
            const failed = () => toast({ variant: 'destructive', description: t('toast.messageFailed') });
            if (content) {
                void sendMessage(cid, { channelId, content, ...(parentId ? { parentId } : {}) }).catch(failed);
            }
            // A rejection here means the row could not even be written; a failed upload resolves and
            // shows on its row instead.
            if (files.length > 0) void sendImages([...files]).catch(failed);
        },
        [cid, channelId, parentId, sendImages, sendMessage, t]
    );

    const retry = useCallback(
        (message: DomainChat) => {
            const failed = () => toast({ variant: 'destructive', description: t('toast.messageFailed') });
            if (!isUnsentImageMessage(message)) {
                void retryMessage(message).catch(failed);
                return;
            }
            // The pictures are gone only when there was nothing to retry with to begin with. A false
            // answer otherwise means a send already running, or a row deleted meanwhile: nothing to say.
            const filesGone = !canRetryImages(message.id);
            void retryImages(message.id).then(retried => {
                if (!retried && filesGone) toast({ variant: 'destructive', description: t('chat.image.retryGone') });
            }, failed);
        },
        [canRetryImages, retryImages, retryMessage, t]
    );

    // A new function whenever the runtime's does, so a memoised row re-renders its Retry.
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

    return { send, retry, canRetry, discard };
};
