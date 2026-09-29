import type { UploadCompleteInput, UploadStartInput } from '@lemoncloud/chatic-sockets-lib';
import type { CheckedUploadCompleteResult, PresignedUploadStartResult } from '../../uploads/types';
import { parseUploadCompleteResult, parseUploadStartResult } from '../../uploads/types';
import type { UploadSocketDomainGateway } from '../gateways';

export type { UploadCompleteInput, UploadStartInput };

export interface IUploadSocketDataSource {
    /** Declares slots and receives one ticket per slot, in the same order. */
    start(payload: UploadStartInput): Promise<PresignedUploadStartResult>;
    /** Settles slots — failed transfers included — and receives each upload's final status. */
    complete(payload: UploadCompleteInput): Promise<CheckedUploadCompleteResult>;
}

/**
 * Upload remote source. The gateway hands both answers back unchecked, cast to whatever type is
 * asked for, so this is the boundary where they are checked: an answer that breaks the upload
 * contract rejects here, as a failed socket operation, and nothing past this class ever holds the
 * unchecked value.
 *
 * It takes no `DataContext` because it caches nothing — an upload has no local row of its own.
 */
export class UploadSocketDataSource implements IUploadSocketDataSource {
    constructor(private readonly gateway: UploadSocketDomainGateway) {}

    public async start(payload: UploadStartInput): Promise<PresignedUploadStartResult> {
        return parseUploadStartResult(await this.gateway.start<unknown>(payload));
    }

    public async complete(payload: UploadCompleteInput): Promise<CheckedUploadCompleteResult> {
        return parseUploadCompleteResult(await this.gateway.complete<unknown>(payload));
    }
}
