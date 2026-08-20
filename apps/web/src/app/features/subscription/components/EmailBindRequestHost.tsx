import { useQueryClient } from '@tanstack/react-query';

import { cloudsKeys } from '@chatic/web-core';

import { useEmailBindRequest } from '../../../stores/useEmailBindRequest';
import { useCloudEmailGuard } from '../hooks';
import { EmailVerifyDialog } from './EmailVerifyDialog';

/**
 * Answers `useEmailBindRequest` — the same dialog `EmailRequiredBanner` uses, just reachable from
 * anywhere (the cloud switcher's unbound-email row) instead of only from "구독 관리". One dialog
 * instance, mounted once, rather than every caller managing its own.
 */
const EmailBindFlow = ({ cloudId }: { cloudId: string }) => {
    const queryClient = useQueryClient();
    const closeEmailBind = useEmailBindRequest(s => s.closeEmailBind);
    const verifyEmail = useCloudEmailGuard();

    return (
        <EmailVerifyDialog
            open
            onOpenChange={open => !open && closeEmailBind()}
            onVerified={() => void queryClient.invalidateQueries({ queryKey: cloudsKeys.all })}
            cloudId={cloudId}
            verifyEmail={verifyEmail}
        />
    );
};

/** Mounted once inside the private router, next to `AddCloudFlowHost`. Renders nothing until asked. */
export const EmailBindRequestHost = () => {
    const cloudId = useEmailBindRequest(s => s.cloudId);
    return cloudId ? <EmailBindFlow cloudId={cloudId} /> : null;
};
