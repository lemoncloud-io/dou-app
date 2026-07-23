import { useCallback } from 'react';
import { useServices } from '../../hooks';
import { provider } from '../../services';
import type { WebMessageData } from '@chatic/app-messages';

export const useTestRecordHandler = () => {
    const { logService: logger } = useServices();
    // `provider.testRecordService` is read inside each callback (not at render) so SQLite opens on the
    // first actual test-record message, off the boot critical path (boot-optimization.md 4.4).

    const handleFetchTestRecord = useCallback(
        async (message: WebMessageData<'FetchTestRecord'>) => {
            const data = message?.data ?? (message as any);
            try {
                if (!data || data.key === undefined) {
                    throw new Error('Fetch key is missing');
                }
                const item = await provider.testRecordService.fetch(data.key);
                return {
                    type: 'OnFetchTestRecord' as const,
                    success: true,
                    data: { key: data.key, item },
                };
            } catch (e) {
                logger.error('TEST', `Fetch error for key: ${data?.key}`, e as Error);
                return {
                    type: 'OnFetchTestRecord' as const,
                    success: false,
                    data: { key: data?.key ?? '', item: null },
                };
            }
        },
        [logger]
    );

    const handleFetchAllTestRecords = useCallback(
        async (message: WebMessageData<'FetchAllTestRecords'>) => {
            const data = message?.data ?? (message as any);
            try {
                const items = await provider.testRecordService.fetchAll(data?.keys);
                return {
                    type: 'OnFetchAllTestRecords' as const,
                    success: true,
                    data: { items },
                };
            } catch (e) {
                logger.error('TEST', `FetchAll error`, e as Error);
                return {
                    type: 'OnFetchAllTestRecords' as const,
                    success: false,
                    data: { items: [] },
                };
            }
        },
        [logger]
    );

    const handleSaveTestRecord = useCallback(
        async (message: WebMessageData<'SaveTestRecord'>) => {
            const data = message?.data ?? (message as any);
            try {
                if (!data || data.key === undefined || data.value === undefined) {
                    throw new Error('Save key or value is missing');
                }
                const success = await provider.testRecordService.save(data.key, data.value);
                return {
                    type: 'OnSaveTestRecord' as const,
                    success: true,
                    data: { key: data.key, success },
                };
            } catch (e) {
                logger.error('TEST', `Save error for key: ${data?.key}`, e as Error);
                return {
                    type: 'OnSaveTestRecord' as const,
                    success: false,
                    data: { key: data?.key ?? '', success: false },
                };
            }
        },
        [logger]
    );

    const handleSaveAllTestRecords = useCallback(
        async (message: WebMessageData<'SaveAllTestRecords'>) => {
            logger.info(
                'TEST',
                `SaveAll received raw message keys: ${Object.keys(message ?? {})}, stringified: ${JSON.stringify(message)}`
            );

            // message.data가 없으면 message 자체 혹은 message.payload 등에서 items를 추출할 수 있도록 방어적으로 처리
            const data = message?.data ?? (message as any);
            const items = data?.items;

            try {
                if (!items || !Array.isArray(items)) {
                    throw new Error(`items array is missing or invalid. keys in data: ${Object.keys(data ?? {})}`);
                }

                const success = await provider.testRecordService.saveAll(items);
                return {
                    type: 'OnSaveAllTestRecords' as const,
                    success: true,
                    data: { success, count: items.length },
                };
            } catch (e) {
                logger.error('TEST', `SaveAll error`, e as Error);
                return {
                    type: 'OnSaveAllTestRecords' as const,
                    success: false,
                    data: { success: false, count: 0 },
                };
            }
        },
        [logger]
    );

    const handleClearTestRecords = useCallback(
        async (_message: WebMessageData<'ClearTestRecords'>) => {
            try {
                const success = await provider.testRecordService.clear();
                return {
                    type: 'OnClearTestRecords' as const,
                    success: true,
                    data: { success },
                };
            } catch (e) {
                logger.error('TEST', `Clear error`, e as Error);
                return {
                    type: 'OnClearTestRecords' as const,
                    success: false,
                    data: { success: false },
                };
            }
        },
        [logger]
    );

    return {
        handleFetchTestRecord,
        handleFetchAllTestRecords,
        handleSaveTestRecord,
        handleSaveAllTestRecords,
        handleClearTestRecords,
    };
};
