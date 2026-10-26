import type { FetchShareIntakeErrorCode, WebMessageData, WebMessageHandlerResponse } from '@chatic/app-messages';
import type { IShareIntakeBridge } from '../../bridge';
import type { ILogService } from '../../services';
import { toError } from './attachmentPickerHandlers';

/**
 * The only ids the native side makes. Checked here, before native code builds a folder path from
 * one: the web is remote content, and an id like `../files` must never reach a file system call.
 */
const SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isShareId = (value: unknown): value is string => typeof value === 'string' && SHARE_ID.test(value);

/** A native rejection keeps these; anything else is `INTERNAL`, never `NOT_FOUND`. */
const FETCH_CODES: readonly FetchShareIntakeErrorCode[] = ['GONE', 'INVALID'];

/** Relays `FetchShareIntake` and `ReleaseShareIntake` to the native ShareIntake module. */
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
            // Checked here so a native answer of the wrong shape fails as what it is, not as a
            // TypeError from the count below.
            if (!Array.isArray(data?.items) || !Array.isArray(data?.refused)) {
                throw new Error('ShareIntake answered without items and refused lists');
            }
            // Counts only: what someone shares can say more about them than a log should hold.
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
            // Said here because the web only learns the code: a discard that failed leaves the shared
            // copies until the sweep, and this is the one place that knows why.
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
