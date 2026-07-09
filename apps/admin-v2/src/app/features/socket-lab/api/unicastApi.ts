/**
 * `api/unicastApi.ts`
 * - Observe 탭 unicast 전송 — 디바이스 상태별 푸시 전달 검증용.
 */
import { webTransport } from '@chatic/web-core';

import type { PushPayload, UnicastEvent, UnicastResult, ViewingTarget } from '@lemoncloud/chatic-sockets-api';

import { getUsersBase, type UsersStage } from './userApi';

export type UnicastTarget = 'user' | 'device';

export interface UnicastInput {
    targetType: UnicastTarget;
    targetId: string;
    type: string;
    data: unknown;
    push?: PushPayload | null;
    viewing?: ViewingTarget | null;
}

export const buildUnicastEvent = (input: UnicastInput): UnicastEvent => ({
    id: `adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    source: 'admin-v2',
    ts: Date.now(),
    version: 1,
    subject: `${input.targetType}:${input.targetId}`,
    data: input.data,
    targetType: input.targetType,
    targetId: input.targetId,
    ...(input.push ? { push$: input.push } : {}),
    ...(input.viewing ? { viewing$: input.viewing } : {}),
});

export const buildSimplePush = (type: string, sender: string, content: string): PushPayload => ({
    title_loc_key: 'push_chat_message_title',
    title_loc_args: [sender],
    loc_key: 'push_chat_message_body',
    loc_args: [content],
    link: '',
    type,
    silent: false,
    data: { content },
});

export const sendUnicast = async (stage: UsersStage, event: UnicastEvent): Promise<UnicastResult> => {
    const { data } = await webTransport
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${getUsersBase(stage)}/sockets/0/unicast`,
        })
        .setBody(event)
        .execute<UnicastResult>();
    if (!data) throw new Error('unicast 응답 본문 없음');
    return data;
};
