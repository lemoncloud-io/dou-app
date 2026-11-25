import { useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime-react';

import { useEmailBindRequest } from '../../../stores/useEmailBindRequest';
import { useCloudEmailGuard } from '../hooks';
import { EmailVerifyDialog } from './EmailVerifyDialog';

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

export const EmailBindRequestHost = () => {
    const cloudId = useEmailBindRequest(s => s.cloudId);
    return cloudId ? <EmailBindFlow cloudId={cloudId} /> : null;
};
