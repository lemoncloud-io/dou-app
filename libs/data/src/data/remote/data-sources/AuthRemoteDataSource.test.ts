import { AuthRemoteDataSource } from './AuthRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { AuthUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
describe('AuthRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let mockEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let dataSource: AuthRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        mockEventBus = { emit: jest.fn(), on: jest.fn(), off: jest.fn() } as any;
        dataSource = new AuthRemoteDataSource(mockEventBus, mockGateways.auth);
    });

    it('updateSocketAuth 호출 시 auth.update 액션으로 request가 전송되어야 한다', async () => {
        const payload: AuthUpdateInput = { token: 'new-token' } as any;
        mockGateways.auth.update.mockResolvedValue({ status: 'ok' } as any);

        const result = await dataSource.updateSocketAuth(payload);

        expect(mockGateways.auth.update).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ status: 'ok' });
    });

    it('handleModelEvent("create", data) 호출 시 domainEventBus에 auth:create를 emit 해야 한다', () => {
        const data = { id: 'auth-1' };
        dataSource.handleModelEvent('create', data);
        expect(mockEventBus.emit).toHaveBeenCalledWith('auth:create', { data });
    });

    it('handleModelEvent("update", data) 호출 시 domainEventBus에 auth:update를 emit 해야 한다', () => {
        const data = { id: 'auth-1' };
        dataSource.handleModelEvent('update', data);
        expect(mockEventBus.emit).toHaveBeenCalledWith('auth:update', { data });
    });

    it('handleModelEvent("delete", data) 호출 시 domainEventBus에 auth:delete를 emit 해야 한다', () => {
        const data = { id: 'auth-1' };
        dataSource.handleModelEvent('delete', data);
        expect(mockEventBus.emit).toHaveBeenCalledWith('auth:delete', { data });
    });
});
