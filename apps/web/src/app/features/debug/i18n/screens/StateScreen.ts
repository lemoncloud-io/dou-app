import { defineDebugStrings } from '../define';

/**
 * Row labels on this screen (`deviceId`, `userId`, `isGuest`, `siteId`, `wss`, …) are left inline in
 * `StateScreen.tsx` rather than in this table: they are the literal field names of the underlying
 * session/session-facts/socket state, kept as-is on purpose so a tester can match a row straight to
 * the field it reads. Only the section chrome — grouping headers and the copy button — is panel copy.
 */
const en = {
    copyState: 'Copy state',
    sections: {
        device: 'Device',
        session: 'Session',
        activeServer: 'Active Server',
        relay: 'Relay',
        cloud: 'Cloud',
        socket: 'Socket',
    },
};

const ko: typeof en = {
    copyState: '상태 복사',
    sections: {
        device: '기기',
        session: '세션',
        activeServer: '활성 서버',
        relay: '릴레이',
        cloud: '클라우드',
        socket: '소켓',
    },
};

export const useStateScreenStrings = defineDebugStrings({ ko, en });
