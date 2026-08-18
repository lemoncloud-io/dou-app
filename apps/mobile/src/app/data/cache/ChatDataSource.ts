import type { CacheChatView, ChatQueryOptions, LastChatItem } from '@chatic/app-messages';
import type { ICacheDataSource } from './types';
import type { ISqliteDatabase } from '../../database';
import { fetchManyByIds } from './fetchManyByIds';

/**
 * 프리뷰 가능 행 판정 — 웹 `isPreviewableChat`(@chatic/data)의 SQL 미러 (ADR-0057).
 *
 * 스레드 답글(parentId)·시스템 행(리액션 이벤트 포함)·실패 전송을 제외하고, 톰스톤(hidden)은
 * 남깁니다("삭제된 메시지입니다"로 렌더되는 채널의 마지막 메시지). 판정 필드들은 추출 컬럼이
 * 없어 `json_extract`로 blob을 읽는데, 각 프로브가 `idx_chats_cid_uid_channel_chatno`를
 * 최신순으로 걷다가 첫 매치에서 멈추므로 평가 행수는 프리뷰 불가한 꼬리 길이에 비례합니다
 * (채널 이력 전체가 아니라).
 *
 * 이 판정은 최적화일 뿐 의미론의 소유자는 웹입니다 — 웹은 응답 행을 자기 규칙으로 재검증하고
 * 어긋나면 그 채널만 윈도우 조회로 폴백합니다. 규칙이 진화해도 구버전 앱이 오답을 강요하지
 * 못하는 이유가 이것입니다.
 */
const PREVIEWABLE_SQL = [
    `json_extract(data, '$.parentId') IS NULL`,
    `COALESCE(json_extract(data, '$.stereo'), '') <> 'system'`,
    `COALESCE(json_extract(data, '$.subType'), '') <> 'reaction'`,
    `COALESCE(json_extract(data, '$.isFailed'), 0) = 0`,
].join(' AND ');

/**
 * 채팅(Chat) 도메인 전용 데이터 소스 구현체
 */
export class ChatDataSource implements ICacheDataSource<CacheChatView, ChatQueryOptions> {
    constructor(
        private readonly database: ISqliteDatabase,
        private readonly tableName: string
    ) {}

    public async fetch(id: string, cid?: string, uid?: string): Promise<CacheChatView | null> {
        let query = `SELECT data FROM ${this.tableName} WHERE id = ?`;
        const params: (string | number)[] = [id];
        if (cid) {
            query += ` AND cid = ?`;
            params.push(cid);
        }
        if (uid) {
            query += ` AND uid = ?`;
            params.push(uid);
        }
        const result = await this.database.execute(query, params);

        if (result.rows && result.rows.length > 0) {
            return JSON.parse(result.rows[0].data as string) as CacheChatView;
        }
        return null;
    }

    public async fetchMany(ids: string[], cid?: string, uid?: string): Promise<CacheChatView[]> {
        return fetchManyByIds<CacheChatView>(this.database, this.tableName, ids, cid, uid);
    }

    public async fetchAll(cid?: string, query?: ChatQueryOptions, uid?: string): Promise<CacheChatView[]> {
        let sql = `SELECT data FROM ${this.tableName}`;
        const params: (string | number)[] = [];
        const conditions: string[] = [];

        if (cid) {
            conditions.push(`cid = ?`);
            params.push(cid);
        }
        if (uid) {
            conditions.push(`uid = ?`);
            params.push(uid);
        }
        if (query?.channelId) {
            conditions.push(`channel_id = ?`);
            params.push(query.channelId);
        }

        if (query?.keyword) {
            conditions.push(`content LIKE ?`);
            params.push(`%${query.keyword}%`);
        }

        // 페이징 커서 조건 추가 (cursorNo 미만)
        if (query?.cursorNo !== undefined && query.cursorNo !== null) {
            conditions.push(`chat_no < ?`);
            params.push(query.cursorNo);
        }

        if (conditions.length > 0) sql += ` WHERE ` + conditions.join(' AND ');

        // 정렬 기준 설정 (채팅의 경우 기본적으로 DESC가 적합하므로 없을 경우 폴백 처리)
        const sortOrder = query?.sort ? query.sort.toUpperCase() : 'DESC';
        sql += ` ORDER BY chat_no ${sortOrder}`;

        // 페이징 Limit 조건 추가
        if (query?.limit !== undefined && query.limit !== null) {
            sql += ` LIMIT ?`;
            params.push(query.limit);
        }

        const result = await this.database.execute(sql, params);

        return (result.rows || []).map((row: any) => JSON.parse(row.data as string) as CacheChatView);
    }

    /**
     * 채널별 최신 프리뷰 1건 + 그 채널의 최대 chat_no (ADR-0057, `FetchLastChatsData`).
     *
     * 채널당 3개의 인덱스 프로브를 씁니다 — 커밋 top-1(프리뷰 판정, DESC LIMIT 1), 미전송
     * 후보(`chat_no = 0`, 실패 제외 — createdAt 최신을 JS에서 택1), `MAX(chat_no)`. 미전송이
     * 있으면 그것이 답입니다(웹 `compareByChatNo`가 0을 최신으로 취급하는 것과 같은 의미론 —
     * 방금 보낸 메시지는 ack 전에도 프리뷰여야 합니다). 쿼리 수는 3N이지만 전부 인프로세스
     * 인덱스 워크라, 비용의 단위는 왕복이지 쿼리 수가 아닙니다(`fetchManyByIds`와 같은 근거).
     *
     * 반환 배열은 요청 순서를 따르지만 호출자(웹)는 channelId로 다시 색인합니다.
     */
    public async fetchLastPerChannel(channelIds: string[], cid?: string, uid?: string): Promise<LastChatItem[]> {
        const uniqueIds = Array.from(new Set(channelIds.filter(Boolean)));
        if (uniqueIds.length === 0) return [];

        const scopeConditions: string[] = [];
        const scopeParams: (string | number)[] = [];
        if (cid) {
            scopeConditions.push('cid = ?');
            scopeParams.push(cid);
        }
        if (uid) {
            scopeConditions.push('uid = ?');
            scopeParams.push(uid);
        }
        const scopeSql = scopeConditions.length > 0 ? `${scopeConditions.join(' AND ')} AND ` : '';

        const results: LastChatItem[] = [];
        for (const channelId of uniqueIds) {
            const channelParams = [...scopeParams, channelId];

            const committedResult = await this.database.execute(
                `SELECT data FROM ${this.tableName} WHERE ${scopeSql}channel_id = ? AND chat_no > 0 AND ${PREVIEWABLE_SQL} ORDER BY chat_no DESC LIMIT 1`,
                channelParams
            );
            const pendingResult = await this.database.execute(
                `SELECT data FROM ${this.tableName} WHERE ${scopeSql}channel_id = ? AND chat_no = 0 AND ${PREVIEWABLE_SQL}`,
                channelParams
            );
            const maxResult = await this.database.execute(
                `SELECT MAX(chat_no) AS last_no FROM ${this.tableName} WHERE ${scopeSql}channel_id = ?`,
                channelParams
            );

            const committed = (committedResult.rows || []).map(
                (row: any) => JSON.parse(row.data as string) as CacheChatView
            )[0];
            // 미전송끼리는 chat_no가 전부 0이라 createdAt이 유일한 순서축입니다. 채널당 0~2행이
            // 보통이라 정렬 대신 최댓값 한 번으로 충분합니다.
            const pending = (pendingResult.rows || [])
                .map((row: any) => JSON.parse(row.data as string) as CacheChatView)
                .reduce<
                    CacheChatView | undefined
                >((best, chat) => (!best || (chat.createdAt ?? 0) >= (best.createdAt ?? 0) ? chat : best), undefined);
            const lastNo = Number((maxResult.rows?.[0] as any)?.last_no ?? 0) || 0;

            results.push({ channelId, lastNo, item: pending ?? committed ?? null });
        }

        return results;
    }

    public async save(id: string, item: CacheChatView, cid: string, uid: string): Promise<void> {
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const channelId = item.channelId || '';
        const chatNo = item.chatNo || 0;
        const createdAt = item.createdAt || 0;
        const content = item.content || '';

        const dataToSave = JSON.stringify({
            ...item,
            id,
            cid,
            uid,
            channelId,
            chatNo,
            createdAt,
        });

        await this.database.execute(sql, [cid, uid, id, channelId, chatNo, createdAt, content, dataToSave]);
    }

    public async saveAll(items: { id: string; data: CacheChatView }[], cid: string, uid: string): Promise<void> {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => {
            const id = item.id;
            const chatData = item.data;

            const channelId = chatData.channelId || '';
            const chatNo = chatData.chatNo || 0;
            const createdAt = chatData.createdAt || 0;
            const content = chatData.content || '';

            const dataToSave = JSON.stringify({
                ...chatData,
                id,
                cid,
                uid,
                channelId,
                chatNo,
                createdAt,
            });

            return [sql, [cid, uid, id, channelId, chatNo, createdAt, content, dataToSave]];
        });

        await this.database.executeBatch(commands);
    }

    public async remove(id: string, cid: string, uid: string): Promise<void> {
        await this.database.execute(`DELETE FROM ${this.tableName} WHERE id = ? AND cid = ? AND uid = ?`, [
            id,
            cid,
            uid,
        ]);
    }

    public async removeAll(ids: string[], cid: string, uid: string): Promise<void> {
        if (ids.length === 0) return;
        const sql = `DELETE FROM ${this.tableName} WHERE id = ? AND cid = ? AND uid = ?`;
        await this.database.executeBatch(ids.map(id => [sql, [id, cid, uid]]));
    }

    public async clear(cid?: string, uid?: string): Promise<void> {
        const conditions: string[] = [];
        const params: string[] = [];
        if (cid) {
            conditions.push('cid = ?');
            params.push(cid);
        }
        if (uid) {
            conditions.push('uid = ?');
            params.push(uid);
        }
        const sql =
            conditions.length > 0
                ? `DELETE FROM ${this.tableName} WHERE ${conditions.join(' AND ')}`
                : `DELETE FROM ${this.tableName}`;
        await this.database.execute(sql, params);
    }
}
