import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { WebMessageAppHandler } from '@chatic/app-messages';

export const useTestRecordHandler = () => {
    const { testRecordService, logService: logger } = useServices();

    const handleFetchTestRecord = useCallback<WebMessageAppHandler<'FetchTestRecord'>>(
        async message => {
            const data = message?.data ?? (message as any);
            try {
                if (!data || data.key === undefined) {
                    throw new Error('Fetch key is missing');
                }
                const item = await testRecordService.fetch(data.key);
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
                    error: { code: 'TEST_FETCH_ERROR', message: e instanceof Error ? e.message : 'Fetch failed' },
                    data: { key: data?.key ?? '', item: null },
                };
            }
        },
        [testRecordService, logger]
    );

    const handleFetchAllTestRecords = useCallback<WebMessageAppHandler<'FetchAllTestRecords'>>(
        async message => {
            const data = message?.data ?? (message as any);
            try {
                const items = await testRecordService.fetchAll(data?.keys);
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
                    error: {
                        code: 'TEST_FETCH_ALL_ERROR',
                        message: e instanceof Error ? e.message : 'FetchAll failed',
                    },
                    data: { items: [] },
                };
            }
        },
        [testRecordService, logger]
    );

    const handleSaveTestRecord = useCallback<WebMessageAppHandler<'SaveTestRecord'>>(
        async message => {
            const data = message?.data ?? (message as any);
            try {
                if (!data || data.key === undefined || data.value === undefined) {
                    throw new Error('Save key or value is missing');
                }
                const success = await testRecordService.save(data.key, data.value);
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
                    error: { code: 'TEST_SAVE_ERROR', message: e instanceof Error ? e.message : 'Save failed' },
                    data: { key: data?.key ?? '', success: false },
                };
            }
        },
        [testRecordService, logger]
    );

    const handleSaveAllTestRecords = useCallback<WebMessageAppHandler<'SaveAllTestRecords'>>(
        async message => {
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

                const success = await testRecordService.saveAll(items);
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
                    error: { code: 'TEST_SAVE_ALL_ERROR', message: e instanceof Error ? e.message : 'SaveAll failed' },
                    data: { success: false, count: 0 },
                };
            }
        },
        [testRecordService, logger]
    );

    const handleClearTestRecords = useCallback<WebMessageAppHandler<'ClearTestRecords'>>(
        async _message => {
            try {
                const success = await testRecordService.clear();
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
                    error: { code: 'TEST_CLEAR_ERROR', message: e instanceof Error ? e.message : 'Clear failed' },
                    data: { success: false },
                };
            }
        },
        [testRecordService, logger]
    );

    return {
        handleFetchTestRecord,
        handleFetchAllTestRecords,
        handleSaveTestRecord,
        handleSaveAllTestRecords,
        handleClearTestRecords,
    };
};
