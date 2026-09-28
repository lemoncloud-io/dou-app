import { defineDebugStrings } from '../define';

const en = {
    intro: 'Check which channel is attached first, then send any command by hand',
    channelsSection: 'Channels',
    channelPresent: 'Present',
    channelAbsent: 'Absent',
    commandSection: 'Command',
    typeLabel: 'Type',
    requestButton: 'request (awaits reply)',
    postButton: 'post (one-way)',
    clear: 'Clear',
    exchangeLog: (count: number) => `Exchange log (${count})`,
    noCommandsSentYet: 'No commands sent yet',
    payloadParseFailed: (message: string) => `payload parse failed: ${message}`,
    /** Logged for `post` calls this screen sends by hand — distinct from the shared hook's own text. */
    sentNoConfirmation: 'Sent (no confirmation)',
};

const ko: typeof en = {
    intro: '채널이 붙어 있는지 먼저 보고, 아무 명령이나 손으로 보냅니다',
    channelsSection: '채널',
    channelPresent: '있음',
    channelAbsent: '없음',
    commandSection: '명령',
    typeLabel: '타입',
    requestButton: 'request (응답 대기)',
    postButton: 'post (일방향)',
    clear: '비우기',
    exchangeLog: count => `주고받은 기록 (${count})`,
    noCommandsSentYet: '아직 보낸 명령이 없습니다',
    payloadParseFailed: message => `payload 파싱 실패: ${message}`,
    sentNoConfirmation: '보냄 (확인 없음)',
};

export const useBridgeScreenStrings = defineDebugStrings({ ko, en });
