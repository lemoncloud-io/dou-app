import { runtime } from '@chatic/runtime';

export const setPhotoSendGrouped = (grouped: boolean): void => {
    runtime.settings.set('ui.photoSendGrouped', grouped, { lane: 'local' });
};

export const usePhotoSendGrouping = () => {
    const raw = runtime.settings.useConfigValue<boolean>('ui.photoSendGrouped');
    return { grouped: typeof raw === 'boolean' ? raw : true, setGrouped: setPhotoSendGrouped };
};
