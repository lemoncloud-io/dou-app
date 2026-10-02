import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { isNative } from '@chatic/bridges';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { attachmentPicker } from '../../../bridge/attachmentPicker';
import { useAppForeground } from '../../../bridge/useAppForeground';
import { getShellFilePut, getShellPut, syncShellTransfers } from '../../../bridge/shellUpload';

type Room = Omit<
    runtime.data.UseSendImagesInput,
    'put' | 'putShellFile' | 'prepareVideo' | 'onVideoRefused' | 'beforeSweep'
>;

/**
 * The runtime's attachment send, bound to this shell: its PUT for page files (native transfer inside
 * the app, the page's own in a browser), the app's sender and video conversion for the files it keeps,
 * and a catch-up with the transfers the app finished while the page was away — on attach, before
 * leftovers are swept, and whenever the app comes back to the front.
 */
export const useSendImages = (room: Room) => {
    const { t } = useTranslation();
    useAppForeground(() => {
        void syncShellTransfers();
    });
    // A refused video fails as a message of its own; this says why, which the failed row cannot.
    const onVideoRefused = useCallback(
        (reason: runtime.data.VideoRefusal) => toast({ title: t(`chat.attach.videoRefused.${reason}`) }),
        [t]
    );
    return runtime.data.useSendImages({
        ...room,
        put: getShellPut(),
        putShellFile: getShellFilePut(),
        ...(isNative() ? { prepareVideo: attachmentPicker.prepareVideo } : {}),
        onVideoRefused,
        beforeSweep: syncShellTransfers,
        // A send can start the moment the page comes back to the front — from an OS picker above all —
        // while its socket is still reconnecting.
        waitForConnection: runtime.data.waitForCloudSocket,
    });
};
