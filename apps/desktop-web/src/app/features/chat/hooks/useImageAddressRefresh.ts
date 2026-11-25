import { useCallback } from 'react';

import { RELAY_CLOUD_ID, runtime, type DomainChat } from '@chatic/runtime-react';

import { toChatFiles, toChatImages } from '../utils';

const refreshed = new Set<string>();

export const resetImageAddressRefresh = (): void => refreshed.clear();

const readMessage = (chatId: string): Promise<DomainChat> => {
    const { cloud } = runtime.session.getGlobalSessionContext();
    return runtime.data.getCloudRepositories(cloud.cloudId || RELAY_CLOUD_ID).chat.getChat({ id: chatId });
};

export const useImageAddressRefresh = () =>
    useCallback(async (chatId: string | undefined, src: string): Promise<void> => {
        const key = `${chatId}|${src}`;
        if (!chatId || refreshed.has(key)) return;
        refreshed.add(key);
        try {
            await readMessage(chatId);
        } catch {
            // Offline or gone — the placeholder stays, and a later failure of a new address tries again.
        }
    }, []);

export const useFreshAddress = () =>
    useCallback(async (chatId: string | undefined, fileId: string): Promise<string | undefined> => {
        if (!chatId) return undefined;
        try {
            const { upload$$ } = await readMessage(chatId);
            const files = [...toChatImages(chatId, upload$$), ...toChatFiles(chatId, upload$$)];
            return files.find(file => file.id === fileId)?.url || undefined;
        } catch {
            return undefined;
        }
    }, []);

export const useRunWithFreshAddress = () => {
    const freshAddress = useFreshAddress();
    return useCallback(
        async <T>(
            file: { chatId: string | undefined; id: string; url: string },
            run: (url: string) => Promise<T>
        ): Promise<T> => {
            try {
                return await run(file.url);
            } catch (error) {
                const fresh = await freshAddress(file.chatId, file.id);
                if (!fresh || fresh === file.url) throw error;
                return run(fresh);
            }
        },
        [freshAddress]
    );
};
