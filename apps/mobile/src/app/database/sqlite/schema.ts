import { TABLES } from './tables';

export const MIGRATIONS: Record<number, string[]> = {
    0: [
        /**
         * Channel
         * - key
         *  - id : channel id
         *  - cid : cloud id
         */
        `CREATE TABLE IF NOT EXISTS ${TABLES.CHANNELS} (
        cid TEXT NOT NULL,
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        sid TEXT NOT NULL,
        data TEXT NOT NULL,
        name TEXT,
        PRIMARY KEY (cid, uid, id)
    );`,
        `CREATE INDEX IF NOT EXISTS idx_channel_cid_uid_sid ON ${TABLES.CHANNELS} (cid, uid, sid);`,

        /**
         * Chat (검색 및 정렬 최적화를 위해 channel_id, created_at 별도 컬럼 추출)
         * - key
         *  - id : chat id
         *  - cid : cloud id
         */
        `CREATE TABLE IF NOT EXISTS ${TABLES.CHATS} (
        cid TEXT NOT NULL,
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        chat_no INTEGER NOT NULL,
        created_at INTEGER,
        content TEXT,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, uid, id)
    );`,
        `CREATE INDEX IF NOT EXISTS idx_chat_cid_uid_channel ON ${TABLES.CHATS} (cid, uid, channel_id);`,
        `CREATE INDEX IF NOT EXISTS idx_chat_cid_uid_chat_no ON ${TABLES.CHATS} (cid, uid, chat_no);`,
        /**
         * User
         * - key
         *  - id : user id
         *  - cid: cloud id
         */
        `CREATE TABLE IF NOT EXISTS ${TABLES.USERS} (
        cid TEXT NOT NULL,
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, uid, id)
    );`,

        /**
         * Join
         * - key
         *  - id: join id
         *  - cid: cloud id
         */
        `CREATE TABLE IF NOT EXISTS ${TABLES.JOINS} (
        cid TEXT NOT NULL,
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, uid, id)
    );`,
        `CREATE INDEX IF NOT EXISTS idx_join_cid_uid_channel ON ${TABLES.JOINS} (cid, uid, channel_id);`,

        /**
         * Site
         *  - key
         *   - id: site id
         *   - cid: cloud id
         */
        `CREATE TABLE IF NOT EXISTS ${TABLES.SITES} (
        cid TEXT NOT NULL,
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, uid, id)
    );`,

        /**
         * InviteCloud
         * - cid 없이 초대된 cloud 정보 저장
         * - key
         * - id: site id
         */
        `CREATE TABLE IF NOT EXISTS ${TABLES.INVITE_CLOUDS} (
        id TEXT NOT NULL PRIMARY KEY,
        data TEXT NOT NULL
    );`,

        /**
         * Meta Table
         * - key: 쿼리 옵션(query)을 직렬화한 고유 식별자
         * - uid: 사용자 스코프 분리를 위한 식별자
         * - data: { ids: string[], uid?: string } 형태의 JSON
         */
        `CREATE TABLE IF NOT EXISTS ${TABLES.METAS} (
        type TEXT NOT NULL,
        cid TEXT NOT NULL,
        uid TEXT NOT NULL,
        key TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER,
        PRIMARY KEY (type, cid, uid, key)
    );`,
    ],
    1: [`ALTER TABLE ${TABLES.SITES} ADD COLUMN name TEXT;`],
    2: [
        `CREATE INDEX IF NOT EXISTS idx_chats_cid_uid_channel_chatno ON chats (cid, uid, channel_id, chat_no DESC);`,
        `CREATE INDEX IF NOT EXISTS idx_channels_cid_uid_sid ON channels (cid, uid, sid);`,
        `CREATE INDEX IF NOT EXISTS idx_joins_cid_uid_channel ON joins (cid, uid, channel_id);`,
        `CREATE INDEX IF NOT EXISTS idx_joins_cid_uid_user ON joins (cid, uid, user_id);`,
        `CREATE INDEX IF NOT EXISTS idx_metas_type_cid_uid_key ON metas (type, cid, uid, key);`,
    ],
    3: [
        `DROP INDEX IF EXISTS idx_metas_type_cid_key;`,
        `ALTER TABLE ${TABLES.METAS} RENAME TO ${TABLES.METAS}_legacy;`,
        `CREATE TABLE IF NOT EXISTS ${TABLES.METAS} (
        type TEXT NOT NULL,
        cid TEXT NOT NULL,
        uid TEXT NOT NULL,
        key TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER,
        PRIMARY KEY (type, cid, uid, key)
    );`,
        `INSERT OR REPLACE INTO ${TABLES.METAS} (type, cid, uid, key, data, updated_at)
         SELECT
           type,
           cid,
           'default' AS uid,
           key,
           data,
           updated_at
         FROM ${TABLES.METAS}_legacy;`,
        `DROP TABLE ${TABLES.METAS}_legacy;`,
        `CREATE INDEX IF NOT EXISTS idx_metas_type_cid_uid_key ON metas (type, cid, uid, key);`,
    ],
    4: [
        `ALTER TABLE ${TABLES.CHANNELS} RENAME TO ${TABLES.CHANNELS}_legacy;`,
        `CREATE TABLE IF NOT EXISTS ${TABLES.CHANNELS} (
        cid TEXT NOT NULL,
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        sid TEXT NOT NULL,
        data TEXT NOT NULL,
        name TEXT,
        PRIMARY KEY (cid, uid, id)
    );`,
        `INSERT OR REPLACE INTO ${TABLES.CHANNELS} (cid, uid, id, sid, data, name)
         SELECT cid, 'default', id, sid, data, name FROM ${TABLES.CHANNELS}_legacy;`,
        `DROP TABLE ${TABLES.CHANNELS}_legacy;`,
        `CREATE INDEX IF NOT EXISTS idx_channel_cid_uid_sid ON ${TABLES.CHANNELS} (cid, uid, sid);`,

        `ALTER TABLE ${TABLES.CHATS} RENAME TO ${TABLES.CHATS}_legacy;`,
        `CREATE TABLE IF NOT EXISTS ${TABLES.CHATS} (
        cid TEXT NOT NULL,
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        chat_no INTEGER NOT NULL,
        created_at INTEGER,
        content TEXT,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, uid, id)
    );`,
        `INSERT OR REPLACE INTO ${TABLES.CHATS} (cid, uid, id, channel_id, chat_no, created_at, content, data)
         SELECT cid, 'default', id, channel_id, chat_no, created_at, content, data FROM ${TABLES.CHATS}_legacy;`,
        `DROP TABLE ${TABLES.CHATS}_legacy;`,
        `CREATE INDEX IF NOT EXISTS idx_chat_cid_uid_channel ON ${TABLES.CHATS} (cid, uid, channel_id);`,
        `CREATE INDEX IF NOT EXISTS idx_chat_cid_uid_chat_no ON ${TABLES.CHATS} (cid, uid, chat_no);`,

        `ALTER TABLE ${TABLES.USERS} RENAME TO ${TABLES.USERS}_legacy;`,
        `CREATE TABLE IF NOT EXISTS ${TABLES.USERS} (
        cid TEXT NOT NULL,
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, uid, id)
    );`,
        `INSERT OR REPLACE INTO ${TABLES.USERS} (cid, uid, id, data)
         SELECT cid, 'default', id, data FROM ${TABLES.USERS}_legacy;`,
        `DROP TABLE ${TABLES.USERS}_legacy;`,

        `ALTER TABLE ${TABLES.JOINS} RENAME TO ${TABLES.JOINS}_legacy;`,
        `CREATE TABLE IF NOT EXISTS ${TABLES.JOINS} (
        cid TEXT NOT NULL,
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, uid, id)
    );`,
        `INSERT OR REPLACE INTO ${TABLES.JOINS} (cid, uid, id, channel_id, user_id, data)
         SELECT cid, 'default', id, channel_id, user_id, data FROM ${TABLES.JOINS}_legacy;`,
        `DROP TABLE ${TABLES.JOINS}_legacy;`,
        `CREATE INDEX IF NOT EXISTS idx_join_cid_uid_channel ON ${TABLES.JOINS} (cid, uid, channel_id);`,
        `CREATE INDEX IF NOT EXISTS idx_join_cid_uid_user ON ${TABLES.JOINS} (cid, uid, user_id);`,

        `ALTER TABLE ${TABLES.SITES} RENAME TO ${TABLES.SITES}_legacy;`,
        `CREATE TABLE IF NOT EXISTS ${TABLES.SITES} (
        cid TEXT NOT NULL,
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, uid, id)
    );`,
        `INSERT OR REPLACE INTO ${TABLES.SITES} (cid, uid, id, name, data)
         SELECT cid, 'default', id, name, data FROM ${TABLES.SITES}_legacy;`,
        `DROP TABLE ${TABLES.SITES}_legacy;`,
    ],
    5: [`DROP TABLE IF EXISTS ${TABLES.METAS};`, `DROP INDEX IF EXISTS idx_metas_type_cid_uid_key;`],
};
export const TARGET_VERSION = Math.max(0, ...Object.keys(MIGRATIONS).map(Number)) + 1;
