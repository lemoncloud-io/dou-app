import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

/**
 * Whether the photo grid sends what was picked as one message (the default) or one message each,
 * as the person last left the grid's checkbox. Remembered per device, the way a chat app's own
 * "send as one" setting is, rather than asked on every send. `ui.photoSendGrouped` is
 * `persist: 'local'`, `writableBy: ['local']`, like the grid's column count.
 */
export const setPhotoSendGrouped = (grouped: boolean): void => {
    config.set('ui.photoSendGrouped', grouped, { lane: 'local' });
};

export const usePhotoSendGrouping = () => {
    const raw = useConfigValue<boolean>('ui.photoSendGrouped');
    // Anything but a boolean is a value this build did not write: the default holds.
    return { grouped: typeof raw === 'boolean' ? raw : true, setGrouped: setPhotoSendGrouped };
};
