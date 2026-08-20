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
            onErrorClick={jest.fn()}
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
        // The provisioning caption owns the message at this stage — not the email prompt.
        expect(screen.queryByText('cloudSessionSheet.emailRequired')).not.toBeInTheDocument();
        expect(screen.getByText('cloudSessionSheet.statusReservedDescription')).toBeInTheDocument();
    });
});

describe('CloudItem — 실패한 클라우드', () => {
    const failed = {
        ...baseCloud,
        status: 'error',
        error: '.accountNo[#mock:1001494] is invalid (duplicated by 1000038) - doPostWorkspace(clouds/1000047)',
    } as CloudView;

    it('상태만 문장으로 알리고 서버 원문은 노출하지 않는다', () => {
        renderItem(failed);

        expect(screen.getByText('cloudSessionSheet.statusErrorDescription')).toBeInTheDocument();
        expect(screen.queryByText(failed.error as string)).not.toBeInTheDocument();
    });

    it('error 필드가 비어 있어도 실패 문장은 그대로 보인다', () => {
        // 서버는 정리된 행에 `error: null`을 실어 보낸다 — CloudView 타입은 string|undefined다.
        renderItem({ ...failed, error: undefined });

        expect(screen.getByText('cloudSessionSheet.statusErrorDescription')).toBeInTheDocument();
    });

    it('탭은 전환이 아니라 onErrorClick으로 간다', () => {
        const onSelectCloud = jest.fn();
        const onErrorClick = jest.fn();
        renderItem(failed, { onSelectCloud, onErrorClick });

        fireEvent.click(screen.getByRole('button'));

        expect(onErrorClick).toHaveBeenCalledTimes(1);
        expect(onSelectCloud).not.toHaveBeenCalled();
    });
});
