import { TABLES } from './tables';

export const SQL_SCHEMAS = [
    /**
     * Cloud
     * - key
     *  - id : id
     *  - cid : cloud id
     */
    `CREATE TABLE IF NOT EXISTS ${TABLES.CLOUDS} (
        cid TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, id)
    );`,

    /**
     * Channel
     * - key
     *  - id : channel id
     *  - cid : cloud id
     */
    `CREATE TABLE IF NOT EXISTS ${TABLES.CHANNELS} (
        cid TEXT NOT NULL,
        id TEXT NOT NULL,
        sid TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, id)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_channel_sid ON ${TABLES.CHANNELS} (sid);`,

    /**
     * Chat (검색 및 정렬 최적화를 위해 channel_id, created_at 별도 컬럼 추출)
     * - key
     *  - id : chat id
     *  - cid : cloud id
     */
    `CREATE TABLE IF NOT EXISTS ${TABLES.CHATS} (
        cid TEXT NOT NULL,
        id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        chat_no INTEGER NOT NULL,
        created_at INTEGER,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, id)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_chat_channel ON ${TABLES.CHATS} (channel_id);`,
    `CREATE INDEX IF NOT EXISTS idx_chat_chat_no ON ${TABLES.CHATS} (chat_no);`,
    /**
     * User
     * - key
     *  - id : user id
     *  - cid: cloud id
     */
    `CREATE TABLE IF NOT EXISTS ${TABLES.USERS} (
        cid TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, id)
    );`,

    /**
     * Join
     * - key
     *  - id: join id
     *  - cid: cloud id
     */
    `CREATE TABLE IF NOT EXISTS ${TABLES.JOINS} (
        cid TEXT NOT NULL,
        id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, id)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_join_channel ON ${TABLES.JOINS} (channel_id);`,

    /**
     * Site
     *  - key
     *   - id: site id
     *   - cid: cloud id
     */
    `CREATE TABLE IF NOT EXISTS ${TABLES.SITES} (
        cid TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, id)
    );`,

    /**
     * UserToken
     *  - key
     *   - id: user id
     *   - cid: cloud id
     */
    `CREATE TABLE IF NOT EXISTS ${TABLES.USER_TOKENS} (
        cid TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (cid, id)
    );`,

    /**
     * InviteCloud
     * - cid 없이 초대된 cloud 정보 저장
     *  - key
     *   - id: site id
     */
    `CREATE TABLE IF NOT EXISTS ${TABLES.INVITE_CLOUDS} (
        id TEXT NOT NULL PRIMARY KEY,
        data TEXT NOT NULL
    );`,
];
