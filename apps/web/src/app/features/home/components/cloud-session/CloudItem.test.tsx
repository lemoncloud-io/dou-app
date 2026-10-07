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

describe('CloudItem — unbound email (active cloud with no email)', () => {
    it('shows the normal email line for a bound cloud', () => {
        renderItem(baseCloud);
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
        expect(screen.queryByText('cloudSessionSheet.emailRequired')).not.toBeInTheDocument();
    });

    it('shows a "register email" prompt instead of a blank line when email is missing', () => {
        renderItem({ ...baseCloud, email: undefined });
        expect(screen.getByText('cloudSessionSheet.emailRequired')).toBeInTheDocument();
    });

    it('routes the tap to onRequestEmailBind instead of onSelectCloud when unbound', () => {
        const onSelectCloud = jest.fn();
        const onRequestEmailBind = jest.fn();
        renderItem({ ...baseCloud, email: undefined }, { onSelectCloud, onRequestEmailBind });

        fireEvent.click(screen.getByRole('button'));

        expect(onRequestEmailBind).toHaveBeenCalledWith('CL1');
        expect(onSelectCloud).not.toHaveBeenCalled();
    });

    it('still switches normally for a bound active cloud', () => {
        const onSelectCloud = jest.fn();
        const onRequestEmailBind = jest.fn();
        renderItem(baseCloud, { onSelectCloud, onRequestEmailBind });

        fireEvent.click(screen.getByRole('button'));

        expect(onSelectCloud).toHaveBeenCalledWith('CL1');
        expect(onRequestEmailBind).not.toHaveBeenCalled();
    });

    it('does not treat a still-provisioning, email-less cloud as unbound', () => {
        renderItem({ ...baseCloud, status: 'reserved', email: undefined });
        // The provisioning badge owns the message at this stage — not the email prompt.
        expect(screen.queryByText('cloudSessionSheet.emailRequired')).not.toBeInTheDocument();
        expect(screen.getByText('cloudSessionSheet.statusProvisioning')).toBeInTheDocument();
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
