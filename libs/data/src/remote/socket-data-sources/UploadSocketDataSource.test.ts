import { UploadSocketDataSource } from './UploadSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';
import { UploadResponseShapeError } from '../../uploads/types';

describe('UploadSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: UploadSocketDataSource;

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new UploadSocketDataSource(mockGateways.upload);
    });

    const startPayload = {
        list: [
            {
                name: 'a.jpg',
                contentType: 'image/jpeg',
                contentSize: 1200,
                width: 40,
                height: 30,
                thumbnail: { contentType: 'image/jpeg', contentSize: 100, width: 4, height: 3 },
            },
        ],
    };

    it('sends upload.start with the payload as given and returns the checked tickets', async () => {
        mockGateways.upload.start.mockResolvedValue({
            list: [
                {
                    upload: { id: 'up-1', status: 'pending', name: 'a.jpg' },
                    transfer: {
                        kind: 'presigned-put',
                        method: 'PUT',
                        url: 'https://s3/o',
                        headers: { a: '1' },
                        maxBytes: 9,
                    },
                    thumbnailTransfer: {
                        kind: 'presigned-put',
                        method: 'PUT',
                        url: 'https://s3/t',
                        headers: {},
                        maxBytes: 9,
                    },
                },
            ],
        });

        const result = await dataSource.start(startPayload);

        expect(mockGateways.upload.start).toHaveBeenCalledWith(startPayload);
        expect(result).toEqual({
            list: [
                {
                    upload: { id: 'up-1', status: 'pending' },
                    transfer: {
                        kind: 'presigned-put',
                        method: 'PUT',
                        url: 'https://s3/o',
                        headers: { a: '1' },
                        maxBytes: 9,
                    },
                    thumbnailTransfer: {
                        kind: 'presigned-put',
                        method: 'PUT',
                        url: 'https://s3/t',
                        headers: {},
                        maxBytes: 9,
                    },
                },
            ],
        });
    });

    it('sends upload.complete with the payload as given and returns the checked statuses', async () => {
        const payload = {
            list: [{ id: 'up-1' }, { id: 'up-2', failure: { source: 'storage', code: 'unknown', status: 500 } }],
        };
        mockGateways.upload.complete.mockResolvedValue({
            list: [
                { id: 'up-1', status: 'stored', url: 'https://cdn/signed' },
                { id: 'up-2', status: 'failed', error: 'storage said no' },
            ],
        });

        const result = await dataSource.complete(payload);

        expect(mockGateways.upload.complete).toHaveBeenCalledWith(payload);
        expect(result).toEqual({
            list: [
                { id: 'up-1', status: 'stored' },
                { id: 'up-2', status: 'failed', error: 'storage said no' },
            ],
        });
    });

    it('fails the start operation as a whole when a ticket is missing a required field', async () => {
        mockGateways.upload.start.mockResolvedValue({
            list: [
                { transfer: { kind: 'presigned-put', method: 'PUT', url: 'https://s3/o', headers: {}, maxBytes: 9 } },
            ],
        });

        await expect(dataSource.start(startPayload)).rejects.toThrow(
            new UploadResponseShapeError('start', 'list[0].upload')
        );
    });

    it('fails the complete operation as a whole when an entry has no id', async () => {
        mockGateways.upload.complete.mockResolvedValue({ list: [{ status: 'stored' }] });

        await expect(dataSource.complete({ list: [{ id: 'up-1' }] })).rejects.toBeInstanceOf(UploadResponseShapeError);
    });

    it('lets a transport rejection through unchanged', async () => {
        const error = new Error('timeout');
        mockGateways.upload.start.mockRejectedValue(error);

        await expect(dataSource.start(startPayload)).rejects.toBe(error);
    });
});
