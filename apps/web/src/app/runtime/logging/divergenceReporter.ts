import { logger, type ObservationData } from '@chatic/bridges';

export interface BadgeDivergenceInput {
    web: number;
    native: number | null;
    active: number;
    others: number;
}

export interface UnreadDivergenceInput {
    channelId: string;
    markedChatNo?: number;
    cursorChatNo?: number;
    headChatNo?: number;
    drawn: number;
    hasReadMetaNo: boolean;
}

export interface MemberDivergenceInput {
    channelId: string;
    rosterOnly: number;
    joinOnly: number;
    joinCount: number;
    rosterKnown: boolean;
}

export interface CloudNameDivergenceInput {
    cid: string;
    cachedName?: string;
    catalogName?: string;
}

export interface IDivergenceReporter {
    badge(input: BadgeDivergenceInput): void;
    unread(input: UnreadDivergenceInput): void;
    member(input: MemberDivergenceInput): void;
    cloudName(input: CloudNameDivergenceInput): void;
}

class DivergenceReporter implements IDivergenceReporter {
    badge({ web, native, active, others }: BadgeDivergenceInput): void {
        if (native === null) return;
        if (web === native) return;

        logger.warn('NOTIFICATION', `badge diverged — ${native > web ? 'device' : 'web'} ahead`, {
            observation: 'badge-divergence',
            web,
            native,
            delta: web - native,
            breakdown: { active, others },
        } satisfies ObservationData);
    }

    unread({ channelId, markedChatNo, cursorChatNo, headChatNo, drawn, hasReadMetaNo }: UnreadDivergenceInput): void {
        if (markedChatNo === undefined) return;
        if (headChatNo !== undefined && headChatNo > markedChatNo) return;
        if (drawn === 0) return;

        const cursorLanded = cursorChatNo !== undefined && cursorChatNo >= markedChatNo;
        logger.warn(
            'CHAT',
            `unread diverged — ${cursorLanded ? 'cursor landed but count remains' : 'cursor behind mark'}`,
            {
                observation: 'unread-divergence',
                channelId,
                markedChatNo,
                cursorChatNo,
                headChatNo,
                drawn,
                cursorLanded,
                hasReadMetaNo,
            } satisfies ObservationData
        );
    }

    member({ channelId, rosterOnly, joinOnly, joinCount, rosterKnown }: MemberDivergenceInput): void {
        if (!rosterKnown) return;
        if (joinCount === 0) return;
        if (rosterOnly === 0 && joinOnly === 0) return;

        logger.warn('CHANNEL', `member diverged — ${rosterOnly > 0 ? 'roster ahead' : 'joins ahead'}`, {
            observation: 'member-divergence',
            channelId,
            rosterOnly,
            joinOnly,
            joinCount,
        } satisfies ObservationData);
    }

    cloudName({ cid, cachedName, catalogName }: CloudNameDivergenceInput): void {
        if (!cachedName || !catalogName) return;
        if (cachedName === catalogName) return;

        logger.warn('CLOUD', 'cloud name diverged — cache and catalog disagree', {
            observation: 'cloud-name-divergence',
            cid,
            cachedLen: cachedName.length,
            catalogLen: catalogName.length,
        } satisfies ObservationData);
    }
}

export const divergenceReporter: IDivergenceReporter = new DivergenceReporter();
