import type { ISocketClient } from '../clients';
import type { SocketMessage } from '@lemoncloud/chatic-sockets-lib';
import type {
    IChannelRemoteDataSource,
    IChatRemoteDataSource,
    IJoinRemoteDataSource,
    ISiteRemoteDataSource,
    IUserRemoteDataSource,
} from '../../data-sources';

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
        private readonly siteRemoteDataSource: ISiteRemoteDataSource,
        private readonly userRemoteDataSource: IUserRemoteDataSource
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

        const modelType = data.type; // e.g. 'chat', 'channel', 'join', 'user', 'site'
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
            case 'site':
                this.siteRemoteDataSource.handleModelEvent(action, data);
                break;
            default:
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
