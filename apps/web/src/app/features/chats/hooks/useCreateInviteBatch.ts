import { cloudCore } from '@chatic/web-core';
import { useClouds } from '@chatic/users';
import type { MyUserInviteBody, MyInviteView } from '@lemoncloud/chatic-backend-api';
import { useUserMutations } from '../../../shared/hooks';

/**
 * 여러 사용자를 일괄 초대하는 커스텀 훅
 * 서버가 딥링크 생성 + SMS 발송까지 일괄 처리
 */
export const useCreateInviteBatch = () => {
    const { data: cloudsData } = useClouds();
    const { requestInviteBatch, isPending } = useUserMutations();

    const createBatchInvite = async (params: { channelId: string; phones: string[] }): Promise<MyInviteView[]> => {
        const selectedCloudId = cloudCore.getSelectedCloudId() ?? '';
        const selectedCloud = cloudsData?.list?.find(c => c.id === selectedCloudId);

        const payload: MyUserInviteBody = {
            to: params.phones,
            channelId: params.channelId,
            cloudId: selectedCloudId,
            cloudName: selectedCloud?.name ?? '',
        };

        return requestInviteBatch(payload);
    };

    return { createBatchInvite, isPending: isPending['invite-batch'] };
};
