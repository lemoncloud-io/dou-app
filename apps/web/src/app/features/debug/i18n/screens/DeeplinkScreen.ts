import { defineDebugStrings } from '../define';

const en = {
    title: 'Send deeplink',
    subtitle: (isOnNative: boolean) =>
        `Makes the app handle it as if the OS had delivered a deeplink${isOnNative ? '' : ' — only works inside the app shell'}`,
    fieldLabel: 'Deeplink',
    placeholder: '/chats or chatic://s?code=…',
    willSend: (url: string) => `Will send: ${url}`,
    sendToApp: 'Send to app',
    commonOnes: 'Common ones',
    /** Keyed by `PRESET_INPUTS`' `key` — the component looks the label up per preset. */
    presets: {
        home: 'Home',
        chatList: 'Chat list',
        prodCrossCheck: 'PROD scheme (cross-check)',
        devCrossCheck: 'DEV scheme (cross-check)',
    },
    sentLogTitle: 'Sent log',
    nothingSentYet: 'Nothing sent yet',
    /** Prefixed in the component with the send timestamp. */
    sentLine: (url: string) => `sent → ${url}`,
};

const ko: typeof en = {
    title: '딥링크 보내기',
    subtitle: isOnNative =>
        `앱이 OS로부터 딥링크를 받은 것처럼 처리하게 합니다${isOnNative ? '' : ' — 앱 셸 안에서만 동작합니다'}`,
    fieldLabel: '딥링크',
    placeholder: '/chats 또는 chatic://s?code=…',
    willSend: url => `보낼 주소: ${url}`,
    sendToApp: '앱으로 보내기',
    commonOnes: '자주 쓰는 것',
    presets: {
        home: '홈',
        chatList: '채팅 목록',
        prodCrossCheck: 'PROD 스킴 (교차 확인)',
        devCrossCheck: 'DEV 스킴 (교차 확인)',
    },
    sentLogTitle: '보낸 기록',
    nothingSentYet: '아직 보낸 것이 없습니다',
    sentLine: url => `보냄 → ${url}`,
};

export const useDeeplinkScreenStrings = defineDebugStrings({ ko, en });
