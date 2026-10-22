import { useTranslation } from 'react-i18next';

import { Button, IconSpinner } from '@chatic/web-ui-kit';

import type { EnsureCloudSession } from '../hooks/useEnsureCloudSession';

interface CloudSessionGateProps {
    session: EnsureCloudSession;
    children: React.ReactNode;
}

/**
 * Holds a screen's body until `useEnsureCloudSession` has the cloud live: a spinner while the
 * switch runs, a retry when it failed, the body once it is ready. The places list is the screen that
 * needs the cloud's own session; a later screen that does too waits and fails the same way.
 */
export const CloudSessionGate = ({ session, children }: CloudSessionGateProps) => {
    const { t } = useTranslation();

    if (session.isReady) return <>{children}</>;

    if (session.error) {
        return (
            <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
                <span className="text-[14px] leading-[1.5] text-description">
                    {t('mypage.cloudManage.enterFailed')}
                </span>
                <Button variant="outline" size="sm" onClick={session.retry}>
                    {t('mypage.cloudManage.retry')}
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-3 px-4 py-10">
            <IconSpinner className="size-6 animate-spin text-muted-foreground" />
            <span className="text-[14px] leading-[1.5] text-description">{t('mypage.cloudManage.entering')}</span>
        </div>
    );
};
