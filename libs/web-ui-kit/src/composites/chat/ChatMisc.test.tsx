import { render, screen } from '@testing-library/react';

import { Divider } from '@chatic/web-ui-kit';
import { GroupLabel } from '@chatic/web-ui-kit';
import { MessageRow } from '@chatic/web-ui-kit';
import { Toast } from '@chatic/web-ui-kit';

describe('GroupLabel', () => {
    it('renders the label', () => {
        render(<GroupLabel label="대화방 설정" />);
        expect(screen.getByText('대화방 설정')).toBeInTheDocument();
    });
});

describe('Divider', () => {
    it('renders a separator; block variant is thicker', () => {
        const { rerender } = render(<Divider />);
        expect(screen.getByRole('separator').className).toContain('h-px');
        rerender(<Divider variant="block" />);
        expect(screen.getByRole('separator').className).toContain('h-1');
    });
});

describe('Toast', () => {
    it('renders the message with status role', () => {
        render(<Toast>채팅방 삭제가 완료되었습니다.</Toast>);
        expect(screen.getByRole('status')).toHaveTextContent('채팅방 삭제가 완료되었습니다.');
    });
});

describe('MessageRow', () => {
    it('renders avatar for other, time and unread', () => {
        render(
            <MessageRow variant="other" avatar={<span>AV</span>} time="오전 11:58" unread={1}>
                <div>bubble</div>
            </MessageRow>
        );
        expect(screen.getByText('AV')).toBeInTheDocument();
        expect(screen.getByText('오전 11:58')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('omits the avatar for mine', () => {
        render(
            <MessageRow variant="mine" avatar={<span>AV</span>} time="오후 12:10">
                <div>bubble</div>
            </MessageRow>
        );
        expect(screen.queryByText('AV')).not.toBeInTheDocument();
    });

    it('renders the status node alongside the time', () => {
        render(
            <MessageRow variant="mine" time="오후 12:10" status={<span>읽음</span>}>
                <div>bubble</div>
            </MessageRow>
        );
        expect(screen.getByText('오후 12:10')).toBeInTheDocument();
        expect(screen.getByText('읽음')).toBeInTheDocument();
    });
});
