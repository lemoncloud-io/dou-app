import { runtime } from '@chatic/app-runtime';

import { useAppForeground } from '../../../bridge/useAppForeground';
import { getShellPut, syncShellTransfers } from '../../../bridge/shellUpload';

/**
 * The runtime's image send, bound to this shell: its PUT (native transfer inside the app, the page's
 * own in a browser), and a catch-up with the transfers the app finished while the page was away — on
 * attach, before leftovers are swept, and whenever the app comes back to the front.
 */
export const useSendImages = (room: Omit<runtime.data.UseSendImagesInput, 'put' | 'beforeSweep'>) => {
    useAppForeground(() => {
        void syncShellTransfers();
    });
    return runtime.data.useSendImages({ ...room, put: getShellPut(), beforeSweep: syncShellTransfers });
};
