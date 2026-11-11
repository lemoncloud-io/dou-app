import { defineDebugStrings } from '../define';

const en = {
    noRoom: 'No room is open. Open a chat room or a thread, and its channel and messages show up here.',
    surface: { room: 'Room', thread: 'Thread' },
    copyAll: 'Copy all',
    channel: {
        title: 'Channel',
        missing: 'The room has no channel row yet',
    },
    focus: {
        title: 'Long-pressed message',
        missing: (id: string) => `${id} is no longer in this room's lists`,
    },
    messages: {
        title: (shown: number, total: number) =>
            shown < total ? `Messages (${shown} of ${total})` : `Messages (${total})`,
        rendered: (count: number) => `Shown (${count})`,
        rows: (count: number) => `Feed rows (${count})`,
        search: 'Filter by id, chat number or text',
        empty: 'No message matches',
    },
    flags: { unsent: 'unsent', hidden: 'hidden' },
    record: {
        held: 'Held by the screen',
        cache: 'Cache row',
        server: 'Server',
        loading: 'Loading…',
        failed: (message: string) => `Failed: ${message}`,
        notCached: 'Not in the cache',
        /** The server reads go through the repository, which writes what comes back. */
        serverWritesCache: 'Server reads also update the cache, like the app’s own reads.',
    },
};

const ko: typeof en = {
    noRoom: '열린 방이 없습니다. 채팅방이나 스레드를 열면 그 채널과 메시지가 여기에 나타납니다.',
    surface: { room: '방', thread: '스레드' },
    copyAll: '전체 복사',
    channel: {
        title: '채널',
        missing: '이 방에는 아직 채널 행이 없습니다',
    },
    focus: {
        title: '롱프레스한 메시지',
        missing: (id: string) => `${id} 메시지가 이 방의 목록에 더 이상 없습니다`,
    },
    messages: {
        title: (shown: number, total: number) =>
            shown < total ? `메시지 (${total}개 중 ${shown}개)` : `메시지 (${total})`,
        rendered: (count: number) => `화면 표시 (${count})`,
        rows: (count: number) => `피드 행 (${count})`,
        search: 'id, 채팅 번호, 내용으로 거르기',
        empty: '일치하는 메시지가 없습니다',
    },
    flags: { unsent: '미전송', hidden: '숨김' },
    record: {
        held: '화면이 들고 있는 값',
        cache: '캐시 행',
        server: '서버',
        loading: '불러오는 중…',
        failed: (message: string) => `실패: ${message}`,
        notCached: '캐시에 없음',
        serverWritesCache: '서버 조회는 앱의 다른 조회처럼 받은 값을 캐시에도 씁니다.',
    },
};

export const useRoomScreenStrings = defineDebugStrings({ ko, en });
