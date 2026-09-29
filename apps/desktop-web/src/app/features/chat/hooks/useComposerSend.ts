import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { xhrPut } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { useChatMutations } from '../../../shared/hooks/useChatMutations';

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
 */
export const useComposerSend = ({ cid, channelId, parentId }: ComposerSendTarget) => {
    const { t } = useTranslation();
    const { sendMessage } = useChatMutations();
    const images = runtime.data.useSendImages({ cid, channelId, ...(parentId ? { parentId } : {}), put: xhrPut });
    const { sendImages } = images;

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

    return { send, images };
};
