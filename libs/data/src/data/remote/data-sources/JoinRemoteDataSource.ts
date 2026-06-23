import type { JoinDomainGateway } from '../gateways';
import type { ChannelJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';
import type { JoinView } from '@lemoncloud/chatic-socials-api';
import type { JoinGetInput } from '@lemoncloud/chatic-sockets-lib';
import type { JoinUpdateInput } from 'node_modules/@lemoncloud/chatic-sockets-lib/dist/lib/join/types';

export interface IJoinRemoteDataSource {
    /** 단일 join 스냅샷을 조회합니다(`join.get`). JoinSyncPlan polling과 refresh 경로가 사용합니다. */
    getJoin(payload: JoinGetInput): Promise<JoinView>;
    /** 특정 메시지까지 읽었음을 서버에 알리고 참여 정보를 동기화합니다. */
    readChat(payload: ChatReadInput): Promise<JoinView>;
    /** 참여 정보(예: 알림 설정 변경)를 수정합니다. */
    updateJoin(payload: JoinUpdateInput): Promise<JoinView>;
    /** 채널에 참여 요청을 보냅니다. */
    joinChannel(payload: ChannelJoinInput): Promise<JoinView>;
}

export class JoinRemoteDataSource implements IJoinRemoteDataSource {
    constructor(private readonly gateway: JoinDomainGateway) {}

    public async getJoin(payload: JoinGetInput): Promise<JoinView> {
        return this.gateway.get<JoinView>(payload);
    }

    public async readChat(payload: ChatReadInput): Promise<JoinView> {
        return this.gateway.read(payload);
    }

    public async updateJoin(payload: JoinUpdateInput): Promise<JoinView> {
        return this.gateway.update(payload);
    }

    public async joinChannel(payload: ChannelJoinInput): Promise<JoinView> {
        return this.gateway.join(payload);
    }
}
