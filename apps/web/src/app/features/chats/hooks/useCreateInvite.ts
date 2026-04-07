import { useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { cloudCore } from '@chatic/web-core';
import { useClouds } from '@chatic/users';

import { firebaseDeeplinkService } from '../apis/firebase-service';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

interface CreateInviteParams {
    channelId: string;
    name: string;
    phone: string;
}

interface CreateInviteResult {
    invite: MyInviteView;
    deeplinkUrl: string;
}

// Parse invite code from Location header (e.g., "/invites/ABC123" -> "ABC123")
const parseCodeFromLocation = (location: string): string | null => {
    const match = location.match(/\/invites\/([^/]+)/);
    return match ? match[1] : location.split('/').pop() || null;
};

export const useCreateInvite = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const { data: cloudsData } = useClouds();
    const [isPending, setIsPending] = useState(false);
    const [isError, setIsError] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const createInvite = (params: CreateInviteParams): Promise<CreateInviteResult> => {
        setIsPending(true);
        setIsError(false);
        setError(null);

        return new Promise((resolve, reject) => {
            const unsub = useWebSocketV2Store.subscribe(
                s => s.lastMessage,
                (envelope: WSSEnvelope<MyInviteView> | null) => {
                    if (envelope?.type !== 'user') return;

                    if (envelope.action === 'error') {
                        unsub();
                        setIsError(true);
                        setIsPending(false);
                        const err = new Error(
                            (envelope.payload as { message?: string })?.message || 'user/invite error'
                        );
                        setError(err);
                        reject(err);
                        return;
                    }

                    if (envelope.action !== 'invite') return;

                    unsub();

                    const payload = envelope.payload as MyInviteView & { Location?: string };

                    // Try to get code from multiple sources
                    let code = payload?.code;
                    if (!code && payload?.Location) {
                        code = parseCodeFromLocation(payload.Location) ?? undefined;
                    }

                    if (!code) {
                        setIsError(true);
                        setIsPending(false);
                        const err = new Error('Failed to get invite code from response');
                        setError(err);
                        reject(err);
                        return;
                    }

                    const selectedCloudId = cloudCore.getSelectedCloudId();
                    const selectedCloud = cloudsData?.list?.find(c => c.id === selectedCloudId);

                    const invite: MyInviteView = {
                        ...payload,
                        code,
                        ...(!payload.siteId && selectedCloudId ? { siteId: selectedCloudId } : {}),
                        ...(!payload.site$ && selectedCloud
                            ? { site$: { id: selectedCloud.id, name: selectedCloud.name ?? undefined } }
                            : {}),
                    };

                    // Create deeplink in Firebase
                    firebaseDeeplinkService
                        .createDeeplink(invite)
                        .then(deeplinkUrl => {
                            setIsPending(false);
                            resolve({ invite, deeplinkUrl });
                        })
                        .catch(err => {
                            setIsError(true);
                            setIsPending(false);
                            setError(err);
                            reject(err);
                        });
                }
            );

            emitAuthenticated({
                type: 'user',
                action: 'invite',
                payload: {
                    channelId: params.channelId,
                    name: params.name,
                    phone: params.phone,
                },
            });
        });
    };

    return { createInvite, isPending, isError, error };
};
