import type { WebMessageData } from '@chatic/app-messages';

import type { IBootSplashService } from '../../services/bootSplash';

export const createBootSplashHandlers = (service: Pick<IBootSplashService, 'onFirstScreenReady'>) => {
    /**
     * Posted, never requested — the web does not wait on it, so there is no reply to send. The
     * service decides what the signal lifts (the launch splash, a crash-reload cover).
     */
    const handleFirstScreenReady = async (_message: WebMessageData<'FirstScreenReady'>) => {
        service.onFirstScreenReady();
        return undefined;
    };

    return { handleFirstScreenReady };
};
