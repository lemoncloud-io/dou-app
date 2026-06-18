import { useCallback } from 'react';
import { switchCloudSessionUseCase, useIssueCloudToken } from '../';

export const useSwitchCloudSession = () => {
    const { mutateAsync: issueCloudToken, isPending } = useIssueCloudToken();

    return {
        switchCloud: useCallback(
            (cloudId: string) => switchCloudSessionUseCase({ cloudId, issueCloudToken }),
            [issueCloudToken]
        ),
        isPending,
    };
};
