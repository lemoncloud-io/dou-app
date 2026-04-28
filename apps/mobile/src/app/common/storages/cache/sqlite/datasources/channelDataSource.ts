// src/storages/sqlite/channelDataSource.ts
import { database, TABLES } from '../core';
import type { ICacheDataSource } from './ICacheDataSource';
import type { CacheChannelView, ChannelQueryOptions } from '@chatic/app-messages';

/**
 * 채널 객체에서(sid)를 안전하게 추출합니다.
 */
const extractSid = (item: any): string => (item?.sid ? String(item.sid) : 'default');

/**
 * 채널 객체에서 채널명(name)을 안전하게 추출합니다.
 */
const extractName = (item: any): string => (item?.name ? String(item.name) : '');

/**
 * 채널 도메인 전용 데이터 소스 구현체
 * 기본 CRUD 외에 사이트별 채널 목록 조회 및 키워드 검색 기능을 제공합니다.
 */
export const channelDataSource: ICacheDataSource<CacheChannelView, ChannelQueryOptions> = {
    /**
     * 단일 채널 정보를 조회합니다.
     * @param id 채널 고유 식별자
     * @param cid 클라우드 식별자
     */
    fetch: async (id, cid) => {
        const query = cid
            ? `SELECT data FROM ${TABLES.CHANNELS} WHERE id = ? AND cid = ?`
            : `SELECT data FROM ${TABLES.CHANNELS} WHERE id = ?`;
        const params = cid ? [id, cid] : [id];

        const result = await database.execute(query, params);
        if (result.rows && result.rows.length > 0) {
            return JSON.parse(result.rows[0].data as string) as CacheChannelView;
        }
        return null;
    },

    /**
     * 조건에 맞는 채널 목록을 조회합니다.
     * @param cid 클라우드 식별자
     * @param query 사이트 ID(sid) 필터링 및 이름(keyword) 검색 조건
     */
    fetchAll: async (cid, query) => {
        let sql = `SELECT data FROM ${TABLES.CHANNELS}`;
        const params: (string | number)[] = [];
        const conditions: string[] = [];

        // 클라우드별 격리 필터링
        if (cid) {
            conditions.push(`cid = ?`);
            params.push(cid);
        }
        // 특정 사이트에 속한 채널 필터링
        if (query?.sid) {
            conditions.push(`sid = ?`);
            params.push(query.sid);
        }
        // 채널명 키워드 검색 (name 컬럼 활용)
        if (query?.keyword) {
            conditions.push(`name LIKE ?`);
            params.push(`%${query.keyword}%`);
        }

        if (conditions.length > 0) {
            sql += ` WHERE ` + conditions.join(' AND ');
        }

        const result = await database.execute(sql, params);
        return (result.rows || []).map(row => JSON.parse(row.data as string) as CacheChannelView);
    },

    /**
     * 채널 정보를 저장하거나 업데이트합니다.
     * 원본 JSON 데이터 외에 sid, name을 개별 컬럼으로 추출하여 인덱싱 성능을 확보합니다.
     */
    save: async (id, item, cid) => {
        const sql = `INSERT OR REPLACE INTO ${TABLES.CHANNELS} (cid, id, sid, name, data) VALUES (?, ?, ?, ?, ?)`;
        await database.execute(sql, [cid, id, extractSid(item), extractName(item), JSON.stringify(item)]);
    },

    /**
     * 다수의 채널 정보를 일괄 저장합니다.
     */
    saveAll: async (items, cid) => {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${TABLES.CHANNELS} (cid, id, sid, name, data) VALUES (?, ?, ?, ?, ?)`;
        const commands: [string, any[]][] = items.map(item => [
            sql,
            [cid, item.id, extractSid(item.data), extractName(item.data), JSON.stringify(item.data)],
        ]);
        await database.executeBatch(commands);
    },

    /**
     *  단일 채널 삭제
     */
    remove: async (id, cid) => {
        await database.execute(`DELETE FROM ${TABLES.CHANNELS} WHERE id = ? AND cid = ?`, [id, cid]);
    },

    /**
     *  다수 채널 일괄 삭제
     */
    removeAll: async (ids, cid) => {
        if (ids.length === 0) return;
        const sql = `DELETE FROM ${TABLES.CHANNELS} WHERE id = ? AND cid = ?`;
        await database.executeBatch(ids.map(id => [sql, [id, cid]]));
    },

    /**
     *  채널 테이블 전체 초기화
     */
    clear: async () => {
        await database.execute(`DELETE FROM ${TABLES.CHANNELS}`);
    },
};
