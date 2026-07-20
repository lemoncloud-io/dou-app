import type { Meta, StoryObj } from '@storybook/react';

import {
    ChatRoomHeader,
    DateDivider,
    FloatingDateChip,
    MessageBubble,
    MessageInput,
    MessageRow,
    ReadReceipt,
    SystemNotice,
} from '@chatic/web-ui-kit';

/**
 * Composed showcase of the chat room screen (group / self cases), assembled from
 * the web-ui-kit chat primitives — the same pieces ChannelRoomPage wires up.
 * Not a shipped component; a visual reference for the design.
 */
const meta: Meta = {
    title: 'web-ui-kit/composites/ChatScreen (showcase)',
    parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj;

const peer = (color: string) => (
    <span className="inline-flex size-[39px] items-center justify-center rounded-full" style={{ background: color }} />
);

const Frame = ({ children }: { children: React.ReactNode }) => (
    <div className="mx-auto flex h-[812px] w-[375px] flex-col border border-input-border bg-background">{children}</div>
);

const composer = (
    <div className="border-t border-border bg-background px-4 py-3">
        <MessageInput value="" onChange={() => undefined} placeholder="메시지를 입력해 주세요" />
    </div>
);

// Group channel — group-glyph header avatar, numeric unread receipts, floating date chip.
export const GroupMany: Story = {
    render: () => (
        <Frame>
            <ChatRoomHeader
                kind="group"
                title="개발 모임방"
                onBack={() => undefined}
                moreMenu={<div className="px-3 py-2 text-sm">설정</div>}
                className="border-b border-border"
            />
            <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col-reverse gap-3 overflow-y-auto pb-4 pt-2">
                    <MessageRow variant="mine" time="오후 12:10">
                        <MessageBubble variant="mine">Lorem ipsum dolor sit amet</MessageBubble>
                    </MessageRow>
                    <MessageRow
                        variant="mine"
                        time="오후 12:10"
                        status={<ReadReceipt readCount={1} unreadCount={28} readLabel="읽음" unreadLabel="안읽음" />}
                    >
                        <MessageBubble variant="mine">Lorem ipsum dolor sit amet</MessageBubble>
                    </MessageRow>
                    <MessageRow variant="other" avatar={peer('#3f5166')} time="오전 11:58">
                        <MessageBubble variant="other">Lorem ipsum dolor sit amet</MessageBubble>
                        <MessageBubble variant="other">
                            Lorem ipsum dolor sit amet Lorem ipsum dolor sit amet
                        </MessageBubble>
                    </MessageRow>
                    <SystemNotice>
                        <span className="font-semibold">레몬</span>님이 채팅방에 입장했습니다.
                    </SystemNotice>
                    <MessageRow variant="mine" time="오전 11:30">
                        <MessageBubble variant="mine">
                            Lorem ipsum dolor sit amet consectetur. 가나다라 마바사
                        </MessageBubble>
                    </MessageRow>
                    <DateDivider label="2025년 00월 00일 월요일" />
                </div>
                <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                    <FloatingDateChip label="7. 01 월" visible />
                </div>
            </div>
            {composer}
        </Frame>
    ),
};

// 1:1 chat — a single unread receipt (peer hasn't read yet).
export const DirectUnread: Story = {
    render: () => (
        <Frame>
            <ChatRoomHeader
                kind="direct"
                title="<친구 이름>"
                onBack={() => undefined}
                moreMenu={<div className="px-3 py-2 text-sm">설정</div>}
                className="border-b border-border"
            />
            <div className="flex min-h-0 flex-1 flex-col-reverse gap-3 overflow-y-auto pb-4 pt-2">
                <MessageRow
                    variant="mine"
                    time="오후 12:10"
                    status={<ReadReceipt readCount={1} unreadCount={1} readLabel="읽음" unreadLabel="안읽음" />}
                >
                    <MessageBubble variant="mine">Lorem ipsum dolor sit amet</MessageBubble>
                </MessageRow>
                <MessageRow variant="other" avatar={peer('#3f5166')} time="오전 11:58">
                    <MessageBubble variant="other">Lorem ipsum dolor sit amet</MessageBubble>
                </MessageRow>
                <DateDivider label="2025년 00월 00일 월요일" />
            </div>
            {composer}
        </Frame>
    ),
};

// Self chat — person-glyph header avatar, overflow menu present, all mine bubbles, no receipts.
export const SelfChat: Story = {
    render: () => (
        <Frame>
            <ChatRoomHeader
                kind="direct"
                title="나와의 채팅"
                onBack={() => undefined}
                moreMenu={<div className="px-3 py-2 text-sm">설정</div>}
                className="border-b border-border"
            />
            <div className="flex min-h-0 flex-1 flex-col-reverse gap-3 overflow-y-auto pb-4 pt-2">
                <MessageRow variant="mine" time="오전 12:58">
                    <MessageBubble variant="mine">Lorem ipsum dolor sit amet</MessageBubble>
                </MessageRow>
                <MessageRow variant="mine" time="오후 1:23">
                    <MessageBubble variant="mine">
                        Lorem ipsum dolor sit amet consectetur. 가나다라 마바사
                    </MessageBubble>
                </MessageRow>
                <DateDivider label="2025년 00월 00일 월요일" />
            </div>
            {composer}
        </Frame>
    ),
};
