import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { SearchInput } from '@chatic/web-ui-kit';

const meta: Meta<typeof SearchInput> = {
    title: 'web-ui-kit/foundations/SearchInput',
    component: SearchInput,
    decorators: [
        Story => (
            <div className="w-[358px] py-2">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof SearchInput>;

const Demo = () => {
    const [value, setValue] = useState('');
    return <SearchInput value={value} onChange={setValue} />;
};

export const Default: Story = { render: () => <Demo /> };
