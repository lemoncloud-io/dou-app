import { CloudHttpDataSource } from './CloudHttpDataSource';
import type { CloudHttpDomainGateway } from '../gateways';
import type { DataContext } from '../../repositories-v2/types';

describe('CloudHttpDataSource', () => {
    const context: DataContext = { cid: 'cloud-a', uid: 'me' };
    let gateway: jest.Mocked<CloudHttpDomainGateway>;
    let dataSource: CloudHttpDataSource;

    beforeEach(() => {
        gateway = {
            list: jest.fn(),
            update: jest.fn(),
            make: jest.fn(),
            release: jest.fn(),
            verifyEmail: jest.fn(),
        };
        dataSource = new CloudHttpDataSource(gateway);
    });

    it('listClouds — maps the wire list to DomainCloud[] and preserves total', async () => {
        gateway.list.mockResolvedValue({
            list: [
                { id: 'c1', name: 'A' },
                { id: 'c2', name: 'B' },
            ],
            total: 2,
        } as any);

        const result = await dataSource.listClouds({ page: 1 }, context);

        expect(gateway.list).toHaveBeenCalledWith({ page: 1 });
        expect(result.meta).toEqual({ total: 2, source: 'remote' });
        expect(result.list).toMatchObject([
            { id: 'c1', name: 'A', cid: 'cloud-a' },
            { id: 'c2', name: 'B', cid: 'cloud-a' },
        ]);
    });

    it('updateCloud — delegates and maps to domain', async () => {
        gateway.update.mockResolvedValue({ id: 'c1', name: 'New name' } as any);

        const result = await dataSource.updateCloud('c1', { name: 'New name' } as never, context);

        expect(gateway.update).toHaveBeenCalledWith('c1', { name: 'New name' });
        expect(result).toMatchObject({ id: 'c1', name: 'New name', cid: 'cloud-a' });
    });

    it('makeCloud / releaseCloud — delegate and map to domain', async () => {
        gateway.make.mockResolvedValue({ id: 'c2' } as any);
        gateway.release.mockResolvedValue({ id: 'c2', status: 'released' } as any);

        await expect(dataSource.makeCloud({ email: 'a@b.com' } as never, context)).resolves.toMatchObject({
            id: 'c2',
            cid: 'cloud-a',
        });
        await expect(dataSource.releaseCloud('c2', context)).resolves.toMatchObject({ id: 'c2', cid: 'cloud-a' });
    });

    it('verifyEmail — no domain mapping, passthrough', async () => {
        gateway.verifyEmail.mockResolvedValue({ verified: true } as any);

        const result = await dataSource.verifyEmail({ email: 'a@b.com' } as never, { dryRun: true });

        expect(gateway.verifyEmail).toHaveBeenCalledWith({ email: 'a@b.com' }, { dryRun: true });
        expect(result).toEqual({ verified: true });
    });

    it('does NOT write to any local cache — HTTP reads keep react-query as the sole cache owner', async () => {
        gateway.list.mockResolvedValue({ list: [{ id: 'c1' }], total: 1 } as any);

        // No local data source is even injectable into this class — its absence from the
        // constructor is the enforcement (ADR-0070 결정 5 원칙 6).
        expect(Object.keys(dataSource)).not.toContain('localDataSource');
        await dataSource.listClouds(undefined, context);
    });
});
