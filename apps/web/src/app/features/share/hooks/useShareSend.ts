import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { runtime, type ChatAttachmentSource, type ShellFileRef } from '@chatic/runtime';
import { logger } from '@chatic/bridges';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { attachmentPicker } from '../../../bridge/attachmentPicker';
import { releaseShareIntake } from '../../../bridge/shareIntake';
import { ROUTES } from '../../../routes/paths';
import type { ShareDestination } from './useShareDestinations';

export type SendFiles = (files: ChatAttachmentSource[], options?: { content?: string }) => Promise<void>;

export interface ShareSendInput {
    destinations: ShareDestination[];
    files: ShellFileRef[];
    content: string;
}

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
            if (sentRef.current || destinations.length === 0 || (files.length === 0 && !content)) return;
            sentRef.current = true;
            setIsSending(true);
            const stay = (notice?: string) => {
                if (notice) toast({ title: notice });
                sentRef.current = false;
                setIsSending(false);
            };

            try {
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
                        logger.warn('chat.share_send_failed', 'share: a room lost its sender during the read', data);
                        toast({ title: t('share.sendFailedSome') });
                    } else {
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
