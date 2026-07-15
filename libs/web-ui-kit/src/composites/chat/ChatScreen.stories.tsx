import type { Meta, StoryObj } from '@storybook/react';

import {
    AvatarGroup,
    ChatRoomHeader,
    DateDivider,
    MessageBubble,
    MessageInput,
    MessageRow,
    ReadReceipt,
    SystemNotice,
} from '@chatic/web-ui-kit';

/**
 * Composed showcase of the rebuilt chat room screen (self / group cases), assembled
 * from the web-ui-kit chat primitives — the same pieces ChannelRoomPage wires up.
 * Not a shipped component; a visual reference for the redesign.
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
const stackDot = (color: string, mine = false) => (
    <span
        className={`inline-block size-6 rounded-full border object-cover ${mine ? 'border-main-accent' : 'border-surface'}`}
        style={{ background: color }}
    />
);

const Frame = ({ children }: { children: React.ReactNode }) => (
    <div className="mx-auto flex h-[812px] w-[375px] flex-col border border-input-border bg-background">{children}</div>
);

const composer = (
    <div className="border-t border-border bg-background px-4 py-3">
        <MessageInput value="" onChange={() => undefined} placeholder="메시지를 입력해 주세요" />
    </div>
);

// Group chat with 22 members — avatar stack + count header, numeric read receipts.
export const GroupMany: Story = {
    render: () => (
        <Frame>
            <ChatRoomHeader
                kind="group"
                title="개발 모임방"
                onBack={() => undefined}
                moreMenu={<div className="px-3 py-2 text-sm">설정</div>}
                meta={
                    <AvatarGroup
                        avatars={[
                            stackDot('#5b6b8c', true),
                            stackDot('#8c6b5b'),
                            stackDot('#5b8c6b'),
                            stackDot('#8c8c5b'),
                            stackDot('#6b5b8c'),
                        ]}
                        count={22}
                    />
                }
                className="border-b border-border"
            />
            <div className="flex min-h-0 flex-1 flex-col-reverse gap-3 overflow-y-auto pb-4 pt-2">
                <MessageRow
                    variant="mine"
                    time="오후 12:10"
                    status={
                        <ReadReceipt
                            variant="count"
                            readCount={100}
                            unreadCount={0}
                            readLabel="읽음"
                            unreadLabel="안읽음"
                        />
                    }
                >
                    <MessageBubble variant="mine">Lorem ipsum dolor sit amet</MessageBubble>
                </MessageRow>
                <MessageRow
                    variant="mine"
                    time="오후 12:10"
                    status={
                        <ReadReceipt
                            variant="count"
                            readCount={72}
                            unreadCount={28}
                            readLabel="읽음"
                            unreadLabel="안읽음"
                        />
                    }
                >
                    <MessageBubble variant="mine">Lorem ipsum dolor sit amet</MessageBubble>
                </MessageRow>
                <MessageRow variant="other" avatar={peer('#3f5166')} time="오전 11:58">
                    <MessageBubble variant="other">Lorem ipsum dolor sit amet</MessageBubble>
                    <MessageBubble variant="other">Lorem ipsum dolor sit amet Lorem ipsum dolor sit amet</MessageBubble>
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
            {composer}
        </Frame>
    ),
};

// Group chat with 2 members — avatar stack of 2 + count "2", binary read receipts.
export const GroupTwo: Story = {
    render: () => (
        <Frame>
            <ChatRoomHeader
                kind="group"
                title="개발 모임방"
                onBack={() => undefined}
                moreMenu={<div className="px-3 py-2 text-sm">설정</div>}
                meta={<AvatarGroup avatars={[stackDot('#5b6b8c', true), stackDot('#8c6b5b')]} count={2} />}
                className="border-b border-border"
            />
            <div className="flex min-h-0 flex-1 flex-col-reverse gap-3 overflow-y-auto pb-4 pt-2">
                <MessageRow
                    variant="mine"
                    time="오후 12:10"
                    status={
                        <ReadReceipt
                            variant="binary"
                            readCount={1}
                            unreadCount={1}
                            readLabel="읽음"
                            unreadLabel="안읽음"
                        />
                    }
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

// Self chat — title only (no avatar/count), overflow menu present, all mine bubbles, no receipts.
export const SelfChat: Story = {
    render: () => (
        <Frame>
            <ChatRoomHeader
                kind="group"
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
