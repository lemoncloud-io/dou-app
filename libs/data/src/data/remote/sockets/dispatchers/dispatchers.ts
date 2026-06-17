import type { ISocketClient } from '../clients';
import type { SocketMessage } from '@lemoncloud/chatic-sockets-lib';
import type {
    IChannelRemoteDataSource,
    IChatRemoteDataSource,
    IJoinRemoteDataSource,
    IUserRemoteDataSource,
    IAuthRemoteDataSource,
    IDeviceRemoteDataSource,
    ISocketsRemoteDataSource,
} from '../../data-sources';

/**
 * ModelType에 정의된 모든 모델 타입입니다.
 */
type ModelType =
    | 'user'
    | 'auth'
    | 'mock'
    | 'test'
    | 'callback'
    | 'channel'
    | 'chat'
    | 'join'
    | 'socket'
    | 'connection'
    | 'device';

export interface ISocketDispatcher {
    destroy(): void;
}

export class SocketDispatcher implements ISocketDispatcher {
    private unsubs: Array<() => void> = [];

    constructor(
        private readonly socketClient: ISocketClient,
        private readonly channelRemoteDataSource: IChannelRemoteDataSource,
        private readonly chatRemoteDataSource: IChatRemoteDataSource,
        private readonly joinRemoteDataSource: IJoinRemoteDataSource,
        private readonly userRemoteDataSource: IUserRemoteDataSource,
        private readonly authRemoteDataSource: IAuthRemoteDataSource,
        private readonly deviceRemoteDataSource: IDeviceRemoteDataSource,
        private readonly socketsRemoteDataSource: ISocketsRemoteDataSource
    ) {
        this.initialize();
    }

    private initialize() {
        this.unsubs.push(this.socketClient.onType('model.create', msg => this.dispatchModelEvent('create', msg)));
        this.unsubs.push(this.socketClient.onType('model.update', msg => this.dispatchModelEvent('update', msg)));
        this.unsubs.push(this.socketClient.onType('model.delete', msg => this.dispatchModelEvent('delete', msg)));
    }

    private dispatchModelEvent(action: 'create' | 'update' | 'delete', msg: SocketMessage<any>) {
        const data = msg.data;
        if (!data) return;

        const modelType = data.type as ModelType;
        switch (modelType) {
            case 'chat':
                this.chatRemoteDataSource.handleModelEvent(action, data);
                break;
            case 'channel':
                this.channelRemoteDataSource.handleModelEvent(action, data);
                break;
            case 'join':
                this.joinRemoteDataSource.handleModelEvent(action, data);
                break;
            case 'user':
                this.userRemoteDataSource.handleModelEvent(action, data);
                break;
            case 'auth':
                this.authRemoteDataSource.handleModelEvent(action, data);
                break;
            case 'device':
                this.deviceRemoteDataSource.handleModelEvent(action, data);
                break;
            case 'socket':
                this.socketsRemoteDataSource.handleSocketModelEvent(action, data);
                break;
            case 'connection':
                this.socketsRemoteDataSource.handleConnectionModelEvent(action, data);
                break;
            case 'mock':
            case 'test':
            case 'callback':
                console.warn(`[SocketDispatcher] unhandled model type: "${modelType}"`);
                break;
            default:
                console.warn(`[SocketDispatcher] unknown model type: "${modelType}"`);
                break;
        }
    }

    public destroy() {
        for (const unsub of this.unsubs) {
            unsub();
        }
        this.unsubs = [];
    }
}
