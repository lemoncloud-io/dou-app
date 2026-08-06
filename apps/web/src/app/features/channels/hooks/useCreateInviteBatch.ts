import { useTranslation } from 'react-i18next';

import type { UserInviteBatchPayload } from '@chatic/data';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import { useUserMutations } from './useUserMutations';
// Direct path, not the `hooks` barrel: the barrel reaches web-core's transport, whose `import.meta`
// jest cannot parse — the same reason CreatePlaceDialog bypasses the `ui/layouts` barrel.
import { useMyProfile } from '../../../hooks/useMyProfile';
import { sendInviteMessage, type InviteMessageChannel } from '../../invite/utils/sendInviteMessage';

/**
 * 사용자 초대 훅 — 단건 및 일괄 초대 지원
 * - createSingleInvite: 1명 초대 → 초대 문구를 **문자로 발송**(앱), 웹에서는 클립보드 복사
 * - requestInviteLink: 1명 초대 → Location 링크만 반환(자동 발송하지 않음). 초대 링크 화면에서 노출/공유용.
 * - createBatchInvite: 여러 명 일괄 초대 (서버가 SMS 발송)
 */
export const useCreateInviteBatch = () => {
    const { t } = useTranslation();
    const { requestInvite, requestInviteBatch, isPending } = useUserMutations();
    // 문자 본문에 쓰는 보낸 사람 이름 — 플레이스 프로필 nick(계정 이름이 아니라).
    const { profile: myProfile } = useMyProfile();

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
     * 단건 초대 — 서버 응답의 Location(딥링크 URL)을 담은 초대 문구를 대상 번호로 **문자 발송**한다.
     * 앱에서는 문자 작성 화면이 프리필된 채 열리고, 웹에서는 문자를 보낼 수단이 없으므로 문구를
     * 클립보드에 복사한다 — 초대 경로 전체가 쓰는 {@link sendInviteMessage}와 같은 규칙이다
     * (ADR-0033 D4).
     *
     * OS 공유 시트를 열던 이전 동작은 대상 번호를 아는데도 사용자가 받는 사람을 다시 고르게 했다.
     *
     * `channel`은 실제로 무엇이 전달을 수행했는지를 알려주므로, 호출부가 안내 문구를 구분할 수 있다
     * (`false` = 초대는 발급됐지만 자동 전달은 실패).
     */
    const createSingleInvite = async (params: {
        channelId: string;
        name: string;
        phone: string;
    }): Promise<{ inviteView: MyInviteView; channel: InviteMessageChannel | false }> => {
        const inviteView = await requestInvite({
            channelId: params.channelId,
            name: params.name,
            phone: params.phone,
        });

        const location = (inviteView as any).Location as string | undefined;
        if (!location) {
            return { inviteView, channel: false };
        }

        const body = t('inviteFriends.smsMessage', {
            senderName: myProfile?.nick || t('inviteFriends.defaultSenderName'),
            deeplink: location,
        });

        return { inviteView, channel: await sendInviteMessage(params.phone, body) };
    };

    /**
     * 일괄 초대 — `to`는 wire에서 배열이므로 번호 목록을 배열로 그대로 넘긴다. 예전에는 이 목록을
     * 콤마로 이어 단일 `alias`로 보냈는데, 서버가 그 문자열을 번호 하나로 파싱하려다 거부했다
     * (`@phone[a,b] is invalid format`).
     *
     * 같은 번호가 두 번 실리면 서버가 같은 대상에 SMS를 두 번 보내므로 중복은 여기서 제거한다
     * (연락처 두 건이 같은 번호를 가질 수 있다). 순서는 유지한다.
     */
    const createBatchInvite = async (params: { channelId: string; phones: string[] }): Promise<MyInviteView[]> => {
        const to = [...new Set(params.phones.map(phone => phone.trim()).filter(Boolean))];
        if (to.length === 0) return [];

        return requestInviteBatch({ to, channelId: params.channelId } as UserInviteBatchPayload);
    };

    return {
        createSingleInvite,
        requestInviteLink,
        createBatchInvite,
        isPending: isPending['invite'] || isPending['invite-batch'],
    };
};
