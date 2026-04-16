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

/**
 * 외부 유저 초대를 위한 딥링크(Deeplink) 생성 전용 커스텀 훅
 */
export const useCreateInvite = () => {
    const { data: cloudsData } = useClouds();
    const { requestInvite, isPending: isMutationPending } = useUserMutations();

    // 파이어베이스 API 통신 전용 로딩 상태
    const [isFirebasePending, setIsFirebasePending] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    /**
     * 연락처 정보를 기반으로 최종 딥링크 URL을 생성하여 반환
     */
    const createInvite = async (params: CreateInviteParams): Promise<CreateInviteResult> => {
        setIsFirebasePending(true);
        setError(null);

        try {
            //소켓 서버에 초대 생성 요청 및 응답 대기 ('user:invite' 이벤트)
            const payload = (await requestInvite({
                channelId: params.channelId,
                name: params.name,
                phone: params.phone,
            })) as MyInviteView & { Location?: string; cloud?: { id?: string; name?: string } };

            // 초대 코드 파싱 및 데이터 수정
            let code = payload?.code;
            if (!code && payload?.Location) {
                code = parseCodeFromLocation(payload.Location) ?? undefined;
            }

            if (!code) {
                throw new Error('Failed to get invite code from response');
            }

            // 현재 선택된 클라우드 정보 가져오기
            const selectedCloudId = cloudCore.getSelectedCloudId();
            const selectedCloud = cloudsData?.list?.find(c => c.id === selectedCloudId);

            const invite: MyInviteView & { cloud?: { id?: string; name?: string } } = {
                ...payload,
                code,
                ...(!payload.siteId && selectedCloudId ? { siteId: selectedCloudId } : {}),
                ...(!payload.site$ && selectedCloud
                    ? { site$: { id: selectedCloud.id, name: selectedCloud.name ?? undefined } }
                    : {}),
                ...(!payload.cloud && selectedCloud
                    ? { cloud: { id: selectedCloud.id, name: selectedCloud.name ?? undefined } }
                    : {}),
            };

            // Firebase 딥링크 서비스를 통한 딥링크 url 생성
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
