import type { JoinGateway } from '../gateways';
import type { ChannelJoinInput, ChannelUpdateJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';
import type { JoinView } from '@lemoncloud/chatic-socials-api';

export interface IJoinRemoteDataSource {
    /** 특정 메시지까지 읽었음을 서버에 알리고 참여 정보를 동기화합니다. */
    readChat(payload: ChatReadInput): Promise<JoinView>;
    /** 참여 정보(예: 알림 설정 변경)를 수정합니다. */
    updateJoin(payload: ChannelUpdateJoinInput): Promise<JoinView>;
    /** 채널에 참여 요청을 보냅니다. */
    joinChannel(payload: ChannelJoinInput): Promise<JoinView>;
}

export class JoinRemoteDataSource implements IJoinRemoteDataSource {
    constructor(private readonly gateway: JoinGateway) {}

    public async readChat(payload: ChatReadInput): Promise<JoinView> {
        return this.gateway.read(payload);
    }

    public async updateJoin(payload: ChannelUpdateJoinInput): Promise<JoinView> {
        return this.gateway.updateJoin(payload);
    }

    public async joinChannel(payload: ChannelJoinInput): Promise<JoinView> {
        return this.gateway.join(payload);
    }
}
