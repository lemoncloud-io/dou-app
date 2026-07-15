import { render, screen } from '@testing-library/react';

import { DateDivider } from '@chatic/web-ui-kit';
import { SystemMessage } from '@chatic/web-ui-kit';

describe('DateDivider', () => {
    it('renders the label', () => {
        render(<DateDivider label="2025년 00월 00일 월요일" />);

        expect(screen.getByText('2025년 00월 00일 월요일')).toBeInTheDocument();
    });
});

describe('SystemMessage', () => {
    it('renders the title and optional description', () => {
        render(<SystemMessage title="<친구>님이 채팅방에 입장했습니다." description="1:1 대화를 시작해 보세요." />);

        expect(screen.getByText('<친구>님이 채팅방에 입장했습니다.')).toBeInTheDocument();
        expect(screen.getByText('1:1 대화를 시작해 보세요.')).toBeInTheDocument();
    });

    it('omits the description when not provided', () => {
        render(<SystemMessage title="입장했습니다." />);

        expect(screen.queryByText('1:1 대화를 시작해 보세요.')).not.toBeInTheDocument();
    });
});
