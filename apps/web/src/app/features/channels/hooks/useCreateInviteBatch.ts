import { isNative } from '@chatic/bridges';
import { appBridge } from '../../../bridge';
import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';
import { useUserMutations } from './useUserMutations';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';

/**
 * 사용자 초대 훅 — 단건(링크 공유) 및 일괄 초대 지원
 * - createSingleInvite: 1명 초대 → 서버 응답의 Location 링크로 공유 시트(모바일) 또는 클립보드 복사(웹)
 * - requestInviteLink: 1명 초대 → Location 링크만 반환(자동 공유하지 않음). 초대 링크 화면에서 노출/공유용.
 * - createBatchInvite: 여러 명 일괄 초대 (서버가 SMS 발송)
 */
export const useCreateInviteBatch = () => {
    const { requestInvite, requestInviteBatch, isPending } = useUserMutations();

    /**
     * 단건 초대 후 서버 응답의 Location(딥링크 URL)을 **공유하지 않고 문자열로 반환**한다.
     * 초대 링크 화면이 이 URL을 노출하고, 실제 공유/복사는 화면의 버튼이 담당한다.
     */
    const requestInviteLink = async (params: { channelId: string; name: string; phone: string }): Promise<string> => {
        const inviteView = await requestInvite({
            channelId: params.channelId,
            name: params.name,
            phone: params.phone,
        });
        const location = (inviteView as any).Location as string | undefined;
        if (!location) {
            throw new Error('Invite link is missing from the response.');
        }
        return location;
    };

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
        // MyUserInviteBody targets a single alias; join the phone list so the
        // server fans out the SMS dispatch for all recipients.
        const payload: MyUserInviteBody = {
            alias: params.phones.join(','),
            type: 'phone',
            name: params.names?.[0] ?? '',
            channelId: params.channelId,
        };

        return requestInviteBatch(payload);
    };

    return {
        createSingleInvite,
        requestInviteLink,
        createBatchInvite,
        isPending: isPending['invite'] || isPending['invite-batch'],
    };
};
