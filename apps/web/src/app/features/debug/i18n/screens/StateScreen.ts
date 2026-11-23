import { defineDebugStrings } from '../define';

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
