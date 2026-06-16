import type { ISocketClient } from '../sockets';
import type { SocketsFindConnectionInput } from '@lemoncloud/chatic-sockets-api';
import type { ConnectionModel } from '@lemoncloud/chatic-sockets-api/dist/modules/sockets/model';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';

export interface ISocketsRemoteDataSource {
    findConnection(payload: SocketsFindConnectionInput): Promise<ConnectionModel>;
    /** 인바운드 socket 모델 이벤트를 처리합니다. */
    handleSocketModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
    /** 인바운드 connection 모델 이벤트를 처리합니다. */
    handleConnectionModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class SocketsRemoteDataSource implements ISocketsRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly client: ISocketClient
    ) {}

    public async findConnection(payload: SocketsFindConnectionInput): Promise<ConnectionModel> {
        return (await this.client.request('sockets.find-connection', payload)) as Promise<ConnectionModel>;
    }

    public handleSocketModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        const eventName = `socket:${action}` as 'socket:create' | 'socket:update' | 'socket:delete';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }

    public handleConnectionModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        const eventName = `connection:${action}` as 'connection:create' | 'connection:update' | 'connection:delete';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
