import { useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime';

import { useEmailBindRequest } from '../../../stores/useEmailBindRequest';
import { useCloudEmailGuard } from '../hooks';
import { EmailVerifyDialog } from './EmailVerifyDialog';

/**
 * Answers `useEmailBindRequest` — registering a recovery email on a cloud that has none. The request
 * comes from cloud management (`features/mypage`), which cannot import this feature, so the dialog
 * is mounted once by the private router and raised through the store.
 */
const EmailBindFlow = ({ cloudId }: { cloudId: string }) => {
    const queryClient = useQueryClient();
    const closeEmailBind = useEmailBindRequest(s => s.closeEmailBind);
    const verifyEmail = useCloudEmailGuard();

    return (
        <EmailVerifyDialog
            open
            onOpenChange={open => !open && closeEmailBind()}
            onVerified={() => void queryClient.invalidateQueries({ queryKey: runtime.data.cloudsKeys.all })}
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
