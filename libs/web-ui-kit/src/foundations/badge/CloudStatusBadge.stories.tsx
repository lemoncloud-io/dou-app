import type { Meta, StoryObj } from '@storybook/react';

import { CloudStatusBadge } from './CloudStatusBadge';

const meta: Meta<typeof CloudStatusBadge> = {
    title: 'web-ui-kit/foundations/CloudStatusBadge',
    component: CloudStatusBadge,
};
export default meta;

type Story = StoryObj<typeof CloudStatusBadge>;

export const Provisioning: Story = { args: { label: '생성 중', variant: 'provisioning' } };
export const Failed: Story = { args: { label: '확인 필요', variant: 'failed' } };
export const Ending: Story = { args: { label: '이용 종료 예정', variant: 'ending' } };
export const Restricted: Story = { args: { label: '이용 제한', variant: 'restricted' } };
