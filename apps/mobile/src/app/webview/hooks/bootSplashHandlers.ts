import type { WebMessageData } from '@chatic/bridge-messages';

import type { IBootSplashService } from '../../services/bootSplash';

export const createBootSplashHandlers = (service: Pick<IBootSplashService, 'onFirstScreenReady'>) => {
    const handleFirstScreenReady = async (_message: WebMessageData<'FirstScreenReady'>) => {
        service.onFirstScreenReady();
        return undefined;
    };

    return { handleFirstScreenReady };
};
