import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { CloudItem } from './CloudItem';

const baseCloud = { id: 'CL1', name: 'My Cloud', status: 'active', email: 'user@example.com' } as CloudView;

const renderItem = (cloud: CloudView, overrides: Partial<Parameters<typeof CloudItem>[0]> = {}) =>
    render(
        <CloudItem
            cloud={cloud}
            isSelected={false}
            isDisabled={false}
            onSelectCloud={jest.fn()}
            onInspectCloud={jest.fn()}
            {...overrides}
        />
    );

describe('CloudItem — a live cloud enters, email or not', () => {
    it.each([
        ['with a recovery email', baseCloud],
        ['without one', { ...baseCloud, email: undefined } as CloudView],
    ])('switches into the cloud %s', (_label, cloud) => {
        const onSelectCloud = jest.fn();
        const onInspectCloud = jest.fn();
        renderItem(cloud, { onSelectCloud, onInspectCloud });

        fireEvent.click(screen.getByRole('button'));

        expect(onSelectCloud).toHaveBeenCalledWith('CL1');
        expect(onInspectCloud).not.toHaveBeenCalled();
    });

    it('never shows the address on the row — the email is cloud management’s business', () => {
        renderItem(baseCloud);

        expect(screen.getByText('My Cloud')).toBeInTheDocument();
        expect(screen.queryByText('user@example.com')).not.toBeInTheDocument();
    });
});

describe('CloudItem — a row that cannot be entered opens cloud management', () => {
    const failed = {
        ...baseCloud,
        status: 'error',
        error: '.accountNo[#mock:1001494] is invalid (duplicated by 1000038) - doPostWorkspace(clouds/1000047)',
    } as CloudView;

    it('wears the badge and the caption, and never the server trace', () => {
        renderItem(failed);

        expect(screen.getByText('cloudSessionSheet.statusFailed')).toBeInTheDocument();
        expect(screen.getByText('cloudSessionSheet.checkInfo')).toBeInTheDocument();
        expect(screen.queryByText(failed.error as string)).not.toBeInTheDocument();
    });

    it.each([
        ['error', undefined],
        ['reserved', undefined],
        ['suspended', { hold: 'downgrade' }],
    ] as const)('routes the tap to onInspectCloud for status %s', (status, state$) => {
        const onSelectCloud = jest.fn();
        const onInspectCloud = jest.fn();
        renderItem({ ...baseCloud, status, state$ }, { onSelectCloud, onInspectCloud });

        fireEvent.click(screen.getByRole('button'));

        expect(onInspectCloud).toHaveBeenCalledWith('CL1');
        expect(onSelectCloud).not.toHaveBeenCalled();
    });

    it('still enters a cloud scheduled to end — it is usable until the renewal', () => {
        const onSelectCloud = jest.fn();
        const onInspectCloud = jest.fn();
        renderItem({ ...baseCloud, state$: { plan: 'drop' } }, { onSelectCloud, onInspectCloud });

        expect(screen.getByText('cloudSessionSheet.statusEnding')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button'));

        expect(onSelectCloud).toHaveBeenCalledWith('CL1');
        expect(onInspectCloud).not.toHaveBeenCalled();
    });

    it('is inert while a switch is in flight', () => {
        const onInspectCloud = jest.fn();
        renderItem(failed, { isDisabled: true, onInspectCloud });

        fireEvent.click(screen.getByRole('button'));

        expect(onInspectCloud).not.toHaveBeenCalled();
    });
});
