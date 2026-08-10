import type { Meta, StoryObj } from '@storybook/react';

import { InfoField, StatusBadge } from '@chatic/web-ui-kit';

const meta: Meta<typeof InfoField> = {
    title: 'web-ui-kit/composites/InfoField',
    component: InfoField,
    args: { label: '플레이스 만든 날짜', children: '2026. 08. 07' },
};
export default meta;

type Story = StoryObj<typeof InfoField>;

export const Default: Story = {};

export const WithNodeValue: Story = {
    args: {
        label: '소유자 정보',
        children: (
            <div className="flex items-center gap-1.5 px-1 py-1.5">
                <StatusBadge label="방장" variant="owner" />
                <span className="text-[15px] font-medium leading-[18px] tracking-[-0.075px]">두유</span>
            </div>
        ),
    },
};

export const Stacked: Story = {
    render: () => (
        <div className="flex flex-col gap-6">
            <InfoField label="초대된 플레이스 이름">두유 홈</InfoField>
            <InfoField label="플레이스 만든 날짜">2026. 08. 07</InfoField>
        </div>
    ),
};
