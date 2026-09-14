import { UserHttpDataSource } from './UserHttpDataSource';
import type { UserHttpDomainGateway } from '../gateways';
import type { DataContext } from '../../repositories-v2/types';

describe('UserHttpDataSource', () => {
    const context: DataContext = { cid: 'cloud-a', uid: 'me' };
    let gateway: jest.Mocked<UserHttpDomainGateway>;
    let dataSource: UserHttpDataSource;

    beforeEach(() => {
        gateway = {
            list: jest.fn(),
            tryProfile: jest.fn(),
            updateProfile: jest.fn(),
            registerDevice: jest.fn(),
        };
        dataSource = new UserHttpDataSource(gateway);
    });

    it('listRelayUsers — maps to DomainUser[]', async () => {
        gateway.list.mockResolvedValue({ list: [{ id: 'u1' }], total: 1 } as any);

        const result = await dataSource.listRelayUsers(undefined, context);

        expect(result.meta).toEqual({ total: 1, source: 'remote' });
        expect(result.list).toMatchObject([{ id: 'u1', cid: 'cloud-a' }]);
    });

    it('tryFetchProfile — errors bubble, matching the gateway (no swallow-and-null here either)', async () => {
        gateway.tryProfile.mockRejectedValue(new Error('down'));

        await expect(dataSource.tryFetchProfile()).rejects.toThrow('down');
    });

    it('updateProfileHttp — delegates uid + body', async () => {
        gateway.updateProfile.mockResolvedValue({ id: 'u1', name: 'New' } as any);

        const result = await dataSource.updateProfileHttp('u1', { name: 'New' });

        expect(gateway.updateProfile).toHaveBeenCalledWith('u1', { name: 'New' });
        expect(result).toEqual({ id: 'u1', name: 'New' });
    });

    it('registerPushDevice — delegates body + opts (IDeviceRegistrationHttpSource surface)', async () => {
        gateway.registerDevice.mockResolvedValue({ registered: true } as any);

        const result = await dataSource.registerPushDevice({ token: 't' }, { force: true });

        expect(gateway.registerDevice).toHaveBeenCalledWith({ token: 't' }, { force: true });
        expect(result).toEqual({ registered: true });
    });
});
