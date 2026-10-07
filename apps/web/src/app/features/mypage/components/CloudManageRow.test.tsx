import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { CloudManageRow } from './CloudManageRow';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const K = 'mypage.cloudManage';
const cloud = { id: 'CL1', name: 'Lemon', status: 'active' } as CloudView;

describe('CloudManageRow', () => {
    it('is a plain row for a live cloud — name, chevron, no badge, no caption', () => {
        render(<CloudManageRow cloud={cloud} onOpen={jest.fn()} />);

        expect(screen.getByText('Lemon')).toBeInTheDocument();
        expect(screen.queryByText(`${K}.checkInfo`)).not.toBeInTheDocument();
        expect(screen.queryByText(/status\./)).not.toBeInTheDocument();
    });

    it.each([
        ['error', undefined, 'setupFailed'],
        ['active', { plan: 'drop' }, 'ending'],
        ['suspended', { hold: 'downgrade' }, 'restricted'],
    ] as const)('wears the badge and the caption for status %s', (status, state$, badgeKey) => {
        render(<CloudManageRow cloud={{ ...cloud, status, state$ }} onOpen={jest.fn()} />);

        expect(screen.getByText(`${K}.status.${badgeKey}`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.checkInfo`)).toBeInTheDocument();
    });

    it('shows a provisioning badge without the caption — waiting is the only action', () => {
        render(<CloudManageRow cloud={{ ...cloud, status: 'reserved' }} onOpen={jest.fn()} />);

        expect(screen.getByText(`${K}.status.provisioning`)).toBeInTheDocument();
        expect(screen.queryByText(`${K}.checkInfo`)).not.toBeInTheDocument();
    });

    it('opens the cloud whatever its state', () => {
        const onOpen = jest.fn();
        render(<CloudManageRow cloud={{ ...cloud, status: 'suspended' }} onOpen={onOpen} />);

        fireEvent.click(screen.getByRole('button'));

        expect(onOpen).toHaveBeenCalledWith('CL1');
    });
});
