import type { UploadCompleteInput, UploadStartInput } from '@lemoncloud/chatic-sockets-lib';
import type { CheckedUploadCompleteResult, PresignedUploadStartResult } from '../../uploads/types';
import { parseUploadCompleteResult, parseUploadStartResult } from '../../uploads/types';
import type { UploadSocketDomainGateway } from '../gateways';

export type { UploadCompleteInput, UploadStartInput };

export interface IUploadSocketDataSource {
    start(payload: UploadStartInput): Promise<PresignedUploadStartResult>;
    complete(payload: UploadCompleteInput): Promise<CheckedUploadCompleteResult>;
}

export class UploadSocketDataSource implements IUploadSocketDataSource {
    constructor(private readonly gateway: UploadSocketDomainGateway) {}

    public async start(payload: UploadStartInput): Promise<PresignedUploadStartResult> {
        return parseUploadStartResult(await this.gateway.start<unknown>(payload));
    }

    public async complete(payload: UploadCompleteInput): Promise<CheckedUploadCompleteResult> {
        return parseUploadCompleteResult(await this.gateway.complete<unknown>(payload));
    }
}
