import type { Meta, StoryObj } from '@storybook/react';

import { Toast } from '@chatic/web-ui-kit';

const meta: Meta<typeof Toast> = {
    title: 'web-ui-kit/foundations/Toast',
    component: Toast,
    decorators: [
        Story => (
            <div className="w-[375px] px-4 py-2">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof Toast>;

export const Default: Story = { args: { children: '채팅방 삭제가 완료되었습니다.' } };

export const Positive: Story = { args: { variant: 'positive', children: '친구 초대 링크를 보냈습니다.' } };

export const Warning: Story = { args: { variant: 'warning', children: '경고 및 에러 상태에 사용해요.' } };

export const ErrorState: Story = { args: { variant: 'error', children: '오류가 발생했어요. 다시 시도해 주세요.' } };

export const Action: Story = {
    render: () => (
        <Toast
            title="1명만 초대 가능해요"
            description={
                <>
                    <span className="font-semibold">PRO</span> 구독 시 여러 명 초대 가능
                </>
            }
            action={
                <>
                    <button type="button" className="text-toast-foreground">
                        구독하기
                    </button>
                    <button type="button" className="text-destructive">
                        닫기
                    </button>
                </>
            }
        />
    ),
};
