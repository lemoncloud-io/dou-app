import { UserHttpDataSource } from './UserHttpDataSource';
import type { UserHttpDomainGateway } from '../gateways';
import type { DataContext } from '../../repositories/types';

describe('UserHttpDataSource', () => {
    const context: DataContext = { cid: 'cloud-a', uid: 'me' };
    let gateway: jest.Mocked<UserHttpDomainGateway>;
    let dataSource: UserHttpDataSource;

    beforeEach(() => {
        gateway = {
            list: jest.fn(),
            tryProfile: jest.fn(),
        };
        dataSource = new UserHttpDataSource(gateway);
    });

    it('listRelayUsers — maps to DomainUser[]', async () => {
        gateway.list.mockResolvedValue({ list: [{ id: 'u1' }], total: 1 } as any);

        const result = await dataSource.listRelayUsers(undefined, context);

        expect(result.meta).toEqual({ total: 1, source: 'remote' });
        expect(result.list).toMatchObject([{ id: 'u1', cid: 'cloud-a' }]);
    });

    it('listRelayUsers — passes an endpoint override through to the gateway', async () => {
        gateway.list.mockResolvedValue({ list: [] } as any);

        await dataSource.listRelayUsers({ page: 0 }, context, { endpoint: 'https://other.test/dou-d1' });

        expect(gateway.list).toHaveBeenCalledWith({ page: 0 }, { endpoint: 'https://other.test/dou-d1' });
    });

    it('tryFetchProfile — errors bubble, matching the gateway (no swallow-and-null here either)', async () => {
        gateway.tryProfile.mockRejectedValue(new Error('down'));

        await expect(dataSource.tryFetchProfile()).rejects.toThrow('down');
    });
});
