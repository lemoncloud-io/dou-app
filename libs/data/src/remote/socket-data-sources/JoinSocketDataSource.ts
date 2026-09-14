import type { JoinSocketDomainGateway } from '../gateways';
import type { ChannelJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';
import type { JoinView } from '@lemoncloud/chatic-socials-api';
import type { JoinGetInput } from '@lemoncloud/chatic-sockets-lib';
// Use the explicit join-domain alias: the bare `JoinUpdateInput` barrel name now resolves to the
// channel variant, but gateway.update expects the JOIN body ({ id, ... }).
import type { JoinDomainUpdateInput as JoinUpdateInput } from '@lemoncloud/chatic-sockets-lib';
import type { DomainJoin } from '../../domain';
import { toDomainJoin } from '../../domain';
import type { DataContext } from '../../repositories-v2/types';

export interface IJoinSocketDataSource {
    /** 단일 join 스냅샷을 조회합니다(`join.get`). JoinSyncPlan polling과 refresh 경로가 사용합니다. */
    getJoin(payload: JoinGetInput, context: DataContext): Promise<DomainJoin>;
    /** 특정 메시지까지 읽었음을 서버에 알리고 참여 정보를 동기화합니다. */
    readChat(payload: ChatReadInput, context: DataContext): Promise<DomainJoin>;
    /** 참여 정보(예: 알림 설정 변경)를 수정합니다. */
    updateJoin(payload: JoinUpdateInput, context: DataContext): Promise<DomainJoin>;
    /** 채널에 참여 요청을 보냅니다. */
    joinChannel(payload: ChannelJoinInput, context: DataContext): Promise<DomainJoin>;
}

/**
 * Join remote source. Single boundary where join API views become domain
 * models; callers receive domain shapes only. The request-time `context`
 * is supplied by the caller to keep a late response on its original scope.
 */
export class JoinSocketDataSource implements IJoinSocketDataSource {
    constructor(private readonly gateway: JoinSocketDomainGateway) {}

    public async getJoin(payload: JoinGetInput, context: DataContext): Promise<DomainJoin> {
        const remote = await this.gateway.get<JoinView>(payload);
        return toDomainJoin((remote || {}) as JoinView, context);
    }

    public async readChat(payload: ChatReadInput, context: DataContext): Promise<DomainJoin> {
        const remote = await this.gateway.read<JoinView>(payload);
        return toDomainJoin((remote || {}) as JoinView, context);
    }

    public async updateJoin(payload: JoinUpdateInput, context: DataContext): Promise<DomainJoin> {
        const remote = await this.gateway.update<JoinView>(payload);
        return toDomainJoin((remote || {}) as JoinView, context);
    }

    public async joinChannel(payload: ChannelJoinInput, context: DataContext): Promise<DomainJoin> {
        const remote = await this.gateway.join<JoinView>(payload);
        return toDomainJoin((remote || {}) as JoinView, context);
    }
}
