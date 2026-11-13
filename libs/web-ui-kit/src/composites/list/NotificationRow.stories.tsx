import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { ProfileAvatar } from '../../foundations/avatar';
import { NotificationTypeChip } from '../../foundations/badge';
import { NotificationRow } from './NotificationRow';

const meta: Meta<typeof NotificationRow> = {
    title: 'web-ui-kit/composites/NotificationRow',
    component: NotificationRow,
    decorators: [
        Story => (
            <div className="w-[375px] bg-background">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof NotificationRow>;

const avatar = <ProfileAvatar size={42} />;

/** The seven cases of the design's case sheet (6024:18586), unread then read. */
export const Cases: Story = {
    render: () => (
        <div className="flex flex-col">
            <NotificationRow
                avatar={avatar}
                sender="언니"
                time="오후 3:27"
                unread
                typeChip={<NotificationTypeChip variant="mention" label="멘션" />}
                location="#겨울 여행"
                body={
                    <>
                        <b className="font-semibold text-foreground">@지선</b> 다음주중으로 계획 짜보면 될듯
                    </>
                }
            />
            <NotificationRow
                avatar={avatar}
                sender="언니"
                time="오후 3:27"
                unread
                typeChip={<NotificationTypeChip variant="mention" label="멘션" />}
                location="#겨울 여행"
                context="스레드 멘션"
                quote="원글: 사진 3장"
                body={
                    <>
                        <b className="font-semibold text-foreground">@지선</b> 여기 방 확인해봐
                    </>
                }
            />
            <NotificationRow
                avatar={avatar}
                sender="언니"
                time="오후 3:27"
                unread
                typeChip={<NotificationTypeChip variant="thread" label="스레드" />}
                location="#겨울 여행"
                context="내 메시지에 답글"
                quote="원글: 이번 여행은 안가본 곳으로 가고 싶은데~"
                body="이번 여행은 삿포로 어때?"
            />
            <NotificationRow
                avatar={avatar}
                sender="언니"
                time="오후 1:05"
                typeChip={<NotificationTypeChip variant="thread" label="스레드" />}
                location="#겨울 여행"
                context="참여한 스레드"
                quote="원글: 숙소 후보 세 곳 정리했어요"
                body="동생: 나는 두 번째 숙소가 좋아"
            />
            <NotificationRow
                avatar={avatar}
                sender="엄마"
                time="어제"
                location="1:1 대화"
                context="내 메시지에 반응 ❤️"
                quote="원글: 오늘 좀 늦을 것 같아~"
                body="오늘 좀 늦을 것 같아~"
            />
            <NotificationRow
                avatar={avatar}
                sender="아빠"
                time="11월 9일"
                location="1:1 대화"
                context="새 메시지"
                body="저녁에 맛있는거 먹게 일찍 들어와"
            />
        </div>
    ),
};

/** Selection mode — tap rows to pick them; the check and the navy tint follow. */
const Selecting = () => {
    const [picked, setPicked] = useState<Set<number>>(new Set([0]));
    const toggle = (index: number) =>
        setPicked(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    return (
        <div className="flex flex-col">
            {[true, true, false].map((unread, index) => (
                <NotificationRow
                    key={index}
                    avatar={avatar}
                    sender="언니"
                    time="오후 3:27"
                    unread={unread}
                    typeChip={<NotificationTypeChip variant="thread" label="스레드" />}
                    location="#겨울 여행"
                    context="내 메시지에 답글"
                    body="이번 여행은 삿포로 어때?"
                    selectable
                    selected={picked.has(index)}
                    onPress={() => toggle(index)}
                />
            ))}
        </div>
    );
};

export const SelectionMode: Story = { render: () => <Selecting /> };
