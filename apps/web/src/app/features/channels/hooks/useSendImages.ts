import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime-react';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { attachmentPicker } from '../../../bridge/attachmentPicker';
import { useAppForeground } from '../../../bridge/useAppForeground';
import { getShellFilePut, getShellPut, syncShellTransfers } from '../../../bridge/shellUpload';

type Room = Omit<
    runtime.data.UseSendImagesInput,
    'put' | 'putShellFile' | 'prepareVideo' | 'onVideoRefused' | 'beforeSweep'
>;

export const useSendImages = (room: Room) => {
    const { t } = useTranslation();
    useAppForeground(() => {
        void syncShellTransfers();
    });
    const onVideoRefused = useCallback(
        (reason: runtime.data.VideoRefusal) => toast({ title: t(`chat.attach.videoRefused.${reason}`) }),
        [t]
    );
    return runtime.data.useSendImages({
        ...room,
        put: getShellPut(),
        putShellFile: getShellFilePut(),
        ...(runtime.media.videoConverter ? { prepareVideo: attachmentPicker.prepareVideo } : {}),
        onVideoRefused,
        beforeSweep: syncShellTransfers,
        waitForConnection: runtime.data.waitForCloudSocket,
    });
};
