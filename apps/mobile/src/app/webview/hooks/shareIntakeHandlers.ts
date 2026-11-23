import type { FetchShareIntakeErrorCode, WebMessageData, WebMessageHandlerResponse } from '@chatic/bridge-messages';
import type { IShareIntakeBridge } from '../../bridge';
import type { ILogService } from '../../services';
import { toError } from './attachmentPickerHandlers';

const SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isShareId = (value: unknown): value is string => typeof value === 'string' && SHARE_ID.test(value);

const FETCH_CODES: readonly FetchShareIntakeErrorCode[] = ['GONE', 'INVALID'];

export const createShareIntakeHandlers = (intake: IShareIntakeBridge, logger: ILogService) => {
    const handleFetchShareIntake = async (
        message: WebMessageData<'FetchShareIntake'>
    ): Promise<WebMessageHandlerResponse<'FetchShareIntake'>> => {
        const { id } = (message.data ?? {}) as Partial<WebMessageData<'FetchShareIntake'>['data']>;
        if (!isShareId(id)) {
            return {
                type: 'OnFetchShareIntake' as const,
                success: false,
                error: { code: 'INVALID', message: 'id must be a share id' },
            };
        }
        try {
            const data = await intake.fetch(id);
            if (!Array.isArray(data?.items) || !Array.isArray(data?.refused)) {
                throw new Error('ShareIntake answered without items and refused lists');
            }
            logger.info(
                'file.share_intake_fetched',
                `FetchShareIntake: ${data.items.length} items, ${data.refused.length} refused, text ${data.text ? 'yes' : 'no'}`
            );
            return { type: 'OnFetchShareIntake' as const, success: true, data };
        } catch (e) {
            const error = toError<FetchShareIntakeErrorCode>(e, FETCH_CODES, 'INTERNAL');
            logger.warn('file.share_intake_failed', `FetchShareIntake failed: ${error.code}`);
            return { type: 'OnFetchShareIntake' as const, success: false, error };
        }
    };

    const handleReleaseShareIntake = async (
        message: WebMessageData<'ReleaseShareIntake'>
    ): Promise<WebMessageHandlerResponse<'ReleaseShareIntake'>> => {
        const { id, discard } = (message.data ?? {}) as Partial<WebMessageData<'ReleaseShareIntake'>['data']>;
        if (!isShareId(id) || typeof discard !== 'boolean') {
            return {
                type: 'OnReleaseShareIntake' as const,
                success: false,
                error: { code: 'INVALID', message: 'id must be a share id and discard a boolean' },
            };
        }
        try {
            await intake.release(id, discard);
            return { type: 'OnReleaseShareIntake' as const, success: true, data: {} };
        } catch (e) {
            logger.warn('file.share_intake_release_failed', `ReleaseShareIntake failed (discard: ${discard})`);
            return {
                type: 'OnReleaseShareIntake' as const,
                success: false,
                error: toError(e, [], 'INTERNAL'),
            };
        }
    };

    return { handleFetchShareIntake, handleReleaseShareIntake };
};
