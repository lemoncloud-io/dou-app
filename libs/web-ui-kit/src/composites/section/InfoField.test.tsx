import { render, screen } from '@testing-library/react';

import { InfoField } from './InfoField';

describe('InfoField', () => {
    it('renders the label above a string value', () => {
        render(<InfoField label="플레이스 만든 날짜">2026. 08. 07</InfoField>);

        expect(screen.getByText('플레이스 만든 날짜')).toBeInTheDocument();
        expect(screen.getByText('2026. 08. 07')).toBeInTheDocument();
    });

    it('renders the muted label and primary value colors', () => {
        render(<InfoField label="플레이스 이름">두유 홈</InfoField>);

        expect(screen.getByText('플레이스 이름').className).toContain('text-description');
        expect(screen.getByText('두유 홈').className).toContain('text-foreground');
    });

    // A node value (a member row) is placed as-is: the field must not wrap it in body typography,
    // which would fight the row's own text scales.
    it('places a node value untouched', () => {
        render(
            <InfoField label="소유자 정보">
                <div data-testid="owner-row">방장 라인</div>
            </InfoField>
        );

        const row = screen.getByTestId('owner-row');
        expect(row).toBeInTheDocument();
        expect(row.className).not.toContain('text-foreground');
    });
});
