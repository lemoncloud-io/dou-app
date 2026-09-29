import { defineDebugStrings } from '../define';

const en = {
    notPublished:
        "Shared observation hasn't been published yet — before the app runtime (ActiveCloudDataProvider) has mounted",
    copyUnread: 'Copy unread',
    none: 'none',
    total: {
        title: 'Total',
        activeCloudTotal: 'Active cloud unread total',
        observedChannels: 'Observed channels',
        inactiveCloudTotal: 'Inactive cloud total (cache)',
        appBadge: 'App badge (active + inactive)',
    },
    bySite: {
        title: (count: number) => `Unread by site (${count})`,
        empty: 'No site has unread',
    },
    byChannel: {
        title: (count: number) => `Unread by channel (${count})`,
        empty: 'No channel has unread',
    },
    derivation: {
        title: (count: number) => `Derivation inputs (${count})`,
        empty: 'No unread, and no cursor missing a snapshot',
        value: (
            headChatNo: number,
            headMetaNo: number,
            cursor: number | string,
            cursorMetaNo: number | string,
            unread: number
        ) => `head ${headChatNo}/${headMetaNo} · cursor ${cursor}/${cursorMetaNo} = ${unread}`,
    },
    inactiveClouds: {
        title: 'Inactive clouds (from local cache)',
        empty: 'No inactive cloud has unread',
    },
};

const ko: typeof en = {
    notPublished: '공유 관측이 아직 게시되지 않았습니다 — 앱 런타임(ActiveCloudDataProvider)이 마운트되기 전입니다',
    copyUnread: '안읽음 복사',
    none: '없음',
    total: {
        title: '전체',
        activeCloudTotal: '활성 클라우드 안읽음 합계',
        observedChannels: '관측 채널 수',
        inactiveCloudTotal: '비활성 클라우드 합계 (캐시)',
        appBadge: '앱 뱃지 (활성 + 비활성)',
    },
    bySite: {
        title: (count: number) => `사이트별 안읽음 (${count})`,
        empty: '안읽음이 있는 사이트가 없습니다',
    },
    byChannel: {
        title: (count: number) => `채널별 안읽음 (${count})`,
        empty: '안읽은 채널이 없습니다',
    },
    derivation: {
        title: (count: number) => `파생 입력 (${count})`,
        empty: '안읽음도, 스냅샷 없는 커서도 없습니다',
        value: (
            headChatNo: number,
            headMetaNo: number,
            cursor: number | string,
            cursorMetaNo: number | string,
            unread: number
        ) => `머리 ${headChatNo}/${headMetaNo} · 커서 ${cursor}/${cursorMetaNo} = ${unread}`,
    },
    inactiveClouds: {
        title: '비활성 클라우드 (로컬 캐시 기준)',
        empty: '안읽음이 있는 비활성 클라우드가 없습니다',
    },
};

export const useUnreadScreenStrings = defineDebugStrings({ ko, en });
