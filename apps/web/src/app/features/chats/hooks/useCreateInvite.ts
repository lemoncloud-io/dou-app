import { useState } from 'react';
import { cloudCore } from '@chatic/web-core';
import { useClouds } from '@chatic/users';

import { firebaseDeeplinkService } from '../apis/firebase-service';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import { useUserMutations } from '@chatic/socket-data';

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
    const { data: cloudsData } = useClouds();
    const { requestInvite, isPending: isMutationPending } = useUserMutations();

    const [isFirebasePending, setIsFirebasePending] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const createInvite = async (params: CreateInviteParams): Promise<CreateInviteResult> => {
        setIsFirebasePending(true);
        setError(null);

        try {
            // 소켓 서버에 초대 생성 요청 및 응답 대기
            const payload = (await requestInvite({
                channelId: params.channelId,
                name: params.name,
                phone: params.phone,
            })) as MyInviteView & { Location?: string };

            // 초대 코드 파싱 및 데이터 보정
            let code = payload?.code;
            if (!code && payload?.Location) {
                code = parseCodeFromLocation(payload.Location) ?? undefined;
            }

            if (!code) {
                throw new Error('Failed to get invite code from response');
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

            const deeplinkUrl = await firebaseDeeplinkService.createDeeplink(invite);

            setIsFirebasePending(false);
            return { invite, deeplinkUrl };
        } catch (err) {
            setIsFirebasePending(false);
            const parsedError = err instanceof Error ? err : new Error(String(err));
            setError(parsedError);
            throw parsedError;
        }
    };

    return {
        createInvite,
        isPending: isMutationPending.invite || isFirebasePending,
        isError: error !== null,
        error,
    };
};
