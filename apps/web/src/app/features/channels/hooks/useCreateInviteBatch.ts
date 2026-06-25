import { isNative } from '@chatic/bridges';
import { appBridge } from '../../../bridge';
import { useClouds, useSessionSelection } from '@chatic/web-core';
import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';
import { useUserMutations } from '../../../hooks';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';

/**
 * 사용자 초대 훅 — 단건(링크 공유) 및 일괄 초대 지원
 * - createSingleInvite: 1명 초대 → 서버 응답의 Location 링크로 공유 시트(모바일) 또는 클립보드 복사(웹)
 * - createBatchInvite: 여러 명 일괄 초대 (서버가 SMS 발송)
 */
export const useCreateInviteBatch = () => {
    const { data: cloudsData } = useClouds();
    const { selectedCloudId } = useSessionSelection();
    const { requestInvite, requestInviteBatch, isPending } = useUserMutations();

    /**
     * 단건 초대 — 서버 응답의 Location(딥링크 URL)을 공유합니다.
     * 모바일: OS 공유 시트 노출, 웹: 클립보드 복사
     */
    const createSingleInvite = async (params: {
        channelId: string;
        name: string;
        phone: string;
    }): Promise<{ inviteView: MyInviteView; shared: boolean }> => {
        const inviteView = await requestInvite({
            channelId: params.channelId,
            name: params.name,
            phone: params.phone,
        });

        const location = (inviteView as any).Location as string | undefined;
        if (!location) {
            return { inviteView, shared: false };
        }

        if (isNative()) {
            appBridge.openShareSheet(location);
        } else {
            await copyMessageToClipboard(location);
        }

        return { inviteView, shared: true };
    };

    const createBatchInvite = async (params: {
        channelId: string;
        phones: string[];
        names?: string[];
    }): Promise<MyInviteView[]> => {
        const selectedCloud = cloudsData?.list?.find(c => c.id === selectedCloudId);

        const payload: MyUserInviteBody = {
            to: params.phones,
            channelId: params.channelId,
            cloudId: selectedCloudId,
            cloudName: selectedCloud?.name ?? '',
            name: params.names?.[0] ?? '',
        };

        return requestInviteBatch(payload);
    };

    return {
        createSingleInvite,
        createBatchInvite,
        isPending: isPending['invite'] || isPending['invite-batch'],
    };
};
