import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import type { ChatAttachmentSource, ShellFileRef } from '@chatic/data';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { attachmentPicker } from '../../../bridge/attachmentPicker';
import { releaseShareIntake } from '../../../bridge/shareIntake';
import { ROUTES } from '../../../routes/paths';
import type { ShareDestination } from './useShareDestinations';

/** A room's file send — the room's own `sendImages`, held by its `DestinationSender`. */
export type SendFiles = (files: ChatAttachmentSource[], options?: { content?: string }) => Promise<void>;

export interface ShareSendInput {
    destinations: ShareDestination[];
    /** What goes as attachments: already judged, at most one message's worth. */
    files: ShellFileRef[];
    /** The caption, or the whole message when nothing but text was shared. */
    content: string;
}

/**
 * Sends a share to each of its destinations, independently, then leaves the composer.
 *
 * Photos are read first, once for every destination: an item comes as the shell's address, and a photo
 * goes up the way a photo from the album does — read into the page, resized and given a thumbnail —
 * not raw. A photo that cannot be read is named and left out; a read that fails outright sends
 * nothing and leaves the composer as it was, for another try.
 *
 * Files go through each room's own attachment send — one `DestinationSender` per destination
 * registers it here, since that send is bound to one room. Text alone goes as a plain message. Each
 * send is started, not awaited: a file send resolves only when every upload is done, which can be
 * minutes, and it keeps going after the composer is gone. A failure lands where any failed message
 * does, as the room's failed row; one destination failing does not hold up another.
 *
 * The share is released without discarding its copies, which the uploads are still reading; the app
 * sweeps them later. Leaving the composer any other way — Cancel, the system back, another share
 * arriving — discards them.
 */
export const useShareSend = (intakeId: string | null) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigate();
    const sendersRef = useRef(new Map<string, SendFiles>());
    const sentRef = useRef(false);
    const mountedRef = useRef(false);
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            // Checked a tick later: a development remount runs this cleanup and the effect again at once,
            // and a share discarded then would be gone before the page could read it. A send under way or
            // done keeps the copies: its uploads read them.
            setTimeout(() => {
                if (!mountedRef.current && !sentRef.current && intakeId) {
                    void releaseShareIntake(intakeId, { discard: true });
                }
            }, 0);
        };
    }, [intakeId]);

    const register = useCallback((channelId: string, send: SendFiles) => {
        sendersRef.current.set(channelId, send);
        return () => {
            if (sendersRef.current.get(channelId) === send) sendersRef.current.delete(channelId);
        };
    }, []);

    const send = useCallback(
        async ({ destinations, files, content }: ShareSendInput) => {
            // Once: a second tap while the first is leaving the page would send everything twice.
            if (sentRef.current || destinations.length === 0 || (files.length === 0 && !content)) return;
            sentRef.current = true;
            setIsSending(true);
            // Every way out that sends nothing hands the composer back as it was.
            const stay = (notice?: string) => {
                if (notice) toast({ title: notice });
                sentRef.current = false;
                setIsSending(false);
            };

            try {
                // A room without its send would be dropped while the share still reads as sent — so
                // check every one before a single photo crosses the bridge.
                if (files.length > 0 && destinations.some(destination => !sendersRef.current.has(destination.id))) {
                    logger.warn('chat.share_send_failed', 'share: a picked room has no sender mounted', {
                        rooms: destinations.length,
                    });
                    stay(t('share.sendFailed'));
                    return;
                }

                let sources: ChatAttachmentSource[] = files;
                let refusedNote: string | undefined;
                if (files.length > 0) {
                    try {
                        const read = await attachmentPicker.readPhotos(files);
                        sources = read.items;
                        if (read.refused.length > 0) {
                            refusedNote = t('share.notSent', { names: read.refused.map(item => item.name).join(', ') });
                        }
                    } catch (error) {
                        logger.warn('file.share_read_failed', 'share: reading the shared photos failed', { error });
                        stay(t('share.sendFailed'));
                        return;
                    }
                    if (sources.length === 0 && !content) {
                        stay(refusedNote);
                        return;
                    }
                }

                for (const destination of destinations) {
                    const data = { cid: destination.cid, channelId: destination.id, files: sources.length };
                    const sendFiles = sendersRef.current.get(destination.id);
                    if (sources.length === 0) {
                        // A text send that fails leaves the room's failed row, which says so itself.
                        runtime.data
                            .sendChatInCloud(destination.cid, { channelId: destination.id, content })
                            .catch((error: unknown) =>
                                logger.warn(
                                    'chat.share_send_failed',
                                    `share: text to a ${destination.kind} room failed`,
                                    {
                                        error,
                                        ...data,
                                    }
                                )
                            );
                    } else if (!sendFiles) {
                        // Its sender went while the photos were read.
                        logger.warn('chat.share_send_failed', 'share: a room lost its sender during the read', data);
                        toast({ title: t('share.sendFailedSome') });
                    } else {
                        // A file send rejects only where no failed row was left — no row written, or one
                        // stuck before its upload — so the person hears of it here or not at all.
                        sendFiles(sources, content ? { content } : {}).catch((error: unknown) => {
                            logger.warn('chat.share_send_failed', `share: send to a ${destination.kind} room failed`, {
                                error,
                                ...data,
                            });
                            toast({ title: t('share.sendFailedSome') });
                        });
                    }
                }

                if (intakeId) void releaseShareIntake(intakeId, { discard: false });
                // One notice: the toaster shows one at a time, so a second would replace the first at once.
                if (destinations.length === 1) {
                    if (refusedNote) toast({ title: refusedNote });
                    navigate(ROUTES.channels.room(destinations[0].id), {
                        replace: true,
                        state: { channel: destinations[0].channel },
                    });
                } else {
                    toast({ title: t('share.sentMany', { count: destinations.length }), description: refusedNote });
                    navigate(ROUTES.home, { replace: true });
                }
            } catch (error) {
                logger.warn('chat.share_send_failed', 'share: the send stopped before it started', { error });
                stay(t('share.sendFailed'));
            }
        },
        [intakeId, navigate, toast, t]
    );

    return { register, send, isSending };
};
