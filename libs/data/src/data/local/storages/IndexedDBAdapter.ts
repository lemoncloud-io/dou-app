import type { CacheChatView, CacheModelOf, CacheQueryOf, CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories-v2/types';
import type { IIndexedDB, IndexedDbQueryExecutor, IndexedDbRow } from '../databases';
import { CHAT_PAGINATION_INDEX, TYPE_CID_UID_INDEX, UNSENT_CHAT_NO } from '../databases';
import type { AdapterScope } from './utils';
import { createTtlMeta, isQuotaExceededError, withCacheMeta } from './utils';
import { BaseDbAdapter } from './types';

/**
 * eviction 대상의 하한. 미전송 행(`UNSENT_CHAT_NO` — 전송 중이거나 실패)은 서버 번호가 아직 없을 뿐
 * 오래된 것이 아니고, `useChats`가 "가장 최신"으로 정렬해 보여 주므로 항상 범위 밖에 둡니다.
 */
const EVICTABLE_CHAT_NO_FLOOR = UNSENT_CHAT_NO + 1;

export interface IndexedDBAdapterOptions<TType extends CacheType> {
    /** 도메인별 쿼리 대리자 */
    executor?: IndexedDbQueryExecutor<TType>;
    /**
     * 'chat' 캐시의 채널당 보관 상한. 미지정이면 무제한(기존 동작)입니다.
     * 상한을 넘으면 가장 오래된(chat_no가 낮은) 메시지부터 제거됩니다.
     */
    maxChatsPerChannel?: number;
}

/**
 * IndexedDB를 저장소로 사용하는 개별 캐시 스토리지 어댑터 클래스입니다.
 * BaseDbAdapter를 상속하여 스코프 계산 등의 기능을 상속하고,
 * 도메인별 쿼리 대리자(IndexedDbQueryExecutor)를 활용하여 역할을 분담합니다.
 *
 * @template TType 캐시 도메인 타입
 */
export class IndexedDBAdapter<TType extends CacheType> extends BaseDbAdapter<TType> {
    constructor(
        private readonly db: IIndexedDB,
        type: TType,
        contextProvider: DataContextProvider,
        private readonly options: IndexedDBAdapterOptions<TType> = {}
    ) {
        super(type, contextProvider);
    }

    private buildKey(cid: string, uid: string, id: string): string {
        return `${this.type}:${cid}:${uid}:${id}`;
    }

    private createSchema(cid: string, uid: string, id: string, item: CacheModelOf<TType>): IndexedDbRow<TType> {
        const row: IndexedDbRow<TType> = {
            key: this.buildKey(cid, uid, id),
            type: this.type,
            cid,
            uid,
            id,
            data: withCacheMeta(this.type, item),
            meta: createTtlMeta(this.type),
        };

        if (this.type === 'chat') {
            const chatItem = item as unknown as CacheChatView;
            if (chatItem.channelId) {
                row.channel_id = chatItem.channelId;
            }
            if (chatItem.chatNo !== undefined) {
                row.chat_no = chatItem.chatNo;
            }
        }

        return row;
    }

    /**
     * 상한을 적용할 대상 채널들. 상한 미설정이거나 chat이 아니면 빈 배열입니다.
     *
     * 미전송 행(`chat_no === UNSENT_CHAT_NO`)만 쓴 경우는 제외합니다 — eviction 경계는
     * `EVICTABLE_CHAT_NO_FLOOR` 이상만 보고 계산되므로, 그런 쓰기는 **답을 바꿀 수 없습니다.**
     * 낙관적 전송·실패 재마킹·outbox 재전송이 전부 여기 해당해서, 보내는 쪽 경로의 프로브가
     * 절반 가까이 사라집니다.
     */
    private cappedChannelIds(rows: IndexedDbRow<TType>[]): string[] {
        if (this.options.maxChatsPerChannel === undefined || this.type !== 'chat') return [];
        const evictable = rows.filter(row => (row.chat_no ?? UNSENT_CHAT_NO) >= EVICTABLE_CHAT_NO_FLOOR);
        return Array.from(new Set(evictable.map(row => row.channel_id).filter((id): id is string => !!id)));
    }

    /**
     * 상한이 설정된 경우에 한해 QuotaExceededError를 1회 복구 시도합니다.
     * 상한이 없으면(기본값) 예외를 그대로 던져 기존 동작을 유지합니다.
     */
    private async writeWithQuotaRecovery(
        write: () => Promise<void>,
        scope: AdapterScope,
        channelIds: string[]
    ): Promise<void> {
        try {
            await write();
        } catch (error) {
            if (channelIds.length === 0 || !isQuotaExceededError(error)) throw error;
            await this.enforceChannelLimits(scope, channelIds);
            await write();
        }
    }

    private async enforceChannelLimits(scope: AdapterScope, channelIds: string[]): Promise<void> {
        const limit = this.options.maxChatsPerChannel;
        if (limit === undefined) return;
        for (const channelId of channelIds) {
            await this.evictChannelOverflow(scope, channelId, limit);
        }
    }

    /**
     * 최신 limit개를 건너뛴 첫 인덱스 키 = 남길 수 없는 가장 새로운 행(제거 경계)입니다.
     * 없으면 상한 이하이므로 아무것도 하지 않습니다.
     *
     * 경계를 **절대 키**로 잡는 것이 핵심입니다. "몇 개 초과인지 세어 그만큼 오래된 쪽에서 읽는"
     * 방식은 두 조회 사이에 다른 save가 오래된 쪽을 지우면 경계가 위로 밀려 아직 보이는 메시지까지
     * 지웁니다. 절대 키는 그 사이 무슨 일이 있어도 "이 키 이하"라는 의미가 변하지 않습니다
     * (동시 제거는 부분집합이 되고, 새 메시지 유입은 경계보다 위라 영향이 없습니다).
     */
    private async evictChannelOverflow(scope: AdapterScope, channelId: string, limit: number): Promise<void> {
        const prefix = [this.type, scope.cid, scope.uid, channelId];
        const lower = [...prefix, EVICTABLE_CHAT_NO_FLOOR];

        const boundary = await this.db.findNewestKeyBeyond(
            CHAT_PAGINATION_INDEX,
            IDBKeyRange.bound(lower, [...prefix, []]),
            limit
        );
        if (boundary === null) return;

        await this.db.clearByRange(CHAT_PAGINATION_INDEX, IDBKeyRange.bound(lower, boundary));
    }

    /**
     * 쓰기 + 상한 유지를 한 곳에 묶습니다. 상한 프로토콜은 세 단계(대상 채널 계산 → quota 복구를
     * 낀 쓰기 → 상한 적용)가 순서대로 맞물려야 하는데, 호출부마다 그걸 다시 적으면 한 줄만 빠져도
     * 상한이 조용히 꺼집니다. 새 쓰기 경로는 이 함수만 지나면 됩니다.
     */
    private async persist(scope: AdapterScope, rows: IndexedDbRow<TType>[], write: () => Promise<void>): Promise<void> {
        const channelIds = this.cappedChannelIds(rows);
        await this.writeWithQuotaRecovery(write, scope, channelIds);
        await this.enforceChannelLimits(scope, channelIds);
    }

    async save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>> {
        const scope = this.getScope();
        const row = this.createSchema(scope.cid, scope.uid, id, item);

        await this.persist(scope, [row], () => this.db.save(row));
        return item;
    }

    async saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]> {
        if (items.length === 0) return [];
        const scope = this.getScope();
        const rows = items
            .map(item => {
                const id = (item as { id?: string }).id;
                if (!id) return null;
                return this.createSchema(scope.cid, scope.uid, id, item);
            })
            .filter((row): row is IndexedDbRow<TType> => row !== null);

        await this.persist(scope, rows, () => this.db.saveAll(rows));
        return items;
    }

    async load(id: string): Promise<CacheModelOf<TType> | null> {
        const scope = this.getScope();
        const key = this.buildKey(scope.cid, scope.uid, id);
        const row = await this.db.load<TType>(key);
        return row?.data ?? null;
    }

    async loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        const scope = this.getScope();

        if (this.options.executor) {
            const rows = await this.options.executor.execute(this.db, { type: this.type, ...scope }, options);
            return rows.map((row: IndexedDbRow<TType>) => row.data);
        }

        const rows = await this.db.loadAll<TType>(TYPE_CID_UID_INDEX, [this.type, scope.cid, scope.uid]);
        return rows.map((row: IndexedDbRow<TType>) => row.data);
    }

    async delete(id: string): Promise<void> {
        const scope = this.getScope();
        await this.db.delete(this.buildKey(scope.cid, scope.uid, id));
    }

    async deleteAll(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const scope = this.getScope();
        const keys = ids.map(id => this.buildKey(scope.cid, scope.uid, id));
        await this.db.deleteAll(keys);
    }

    async clearAll(): Promise<void> {
        const scope = this.getScope();
        await this.db.clearAll(TYPE_CID_UID_INDEX, [this.type, scope.cid, scope.uid]);
    }

    override async clearByChannelId(channelId: string): Promise<void> {
        const scope = this.getScope();
        const lower = [this.type, scope.cid, scope.uid, channelId];
        const upper = [this.type, scope.cid, scope.uid, channelId, []];
        const range = IDBKeyRange.bound(lower, upper);
        await this.db.clearByRange(CHAT_PAGINATION_INDEX, range);
    }
}
