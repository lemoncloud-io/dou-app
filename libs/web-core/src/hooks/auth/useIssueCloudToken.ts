import { useCustomMutation } from '@chatic/shared';
import { issueCloudDelegationToken, issueCloudToken } from '../../api';
import type { IssueCloudTokenResult } from '../../api';
import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';

export const useIssueCloudToken = () => {
    return useCustomMutation<IssueCloudTokenResult, string, string>(async (cloudId: string) => {
        const cloudDelegationToken: CloudDelegationTokenView = await issueCloudDelegationToken(cloudId);
        const userToken: UserTokenView = await issueCloudToken(cloudDelegationToken.backend as string, {
            delegationToken: cloudDelegationToken.delegationToken,
        });

        return { cloudDelegationToken, userToken };
    });
};
