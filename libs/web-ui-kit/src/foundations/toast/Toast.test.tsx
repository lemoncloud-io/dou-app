import { render, screen } from '@testing-library/react';

import { Toast } from './Toast';

describe('Toast', () => {
    it('renders a single-line message with status role', () => {
        render(<Toast>채팅방 삭제가 완료되었습니다.</Toast>);
        expect(screen.getByRole('status')).toHaveTextContent('채팅방 삭제가 완료되었습니다.');
    });

    it('positive variant still renders the message', () => {
        render(<Toast variant="positive">친구 초대 링크를 보냈습니다.</Toast>);
        expect(screen.getByRole('status')).toHaveTextContent('친구 초대 링크를 보냈습니다.');
    });

    it('warning / error variants render the message with an assertive alert role', () => {
        const { rerender } = render(<Toast variant="warning">경고 상태</Toast>);
        expect(screen.getByRole('alert')).toHaveTextContent('경고 상태');
        rerender(<Toast variant="error">에러 상태</Toast>);
        expect(screen.getByRole('alert')).toHaveTextContent('에러 상태');
    });

    it('action variant renders title, description and trailing actions', () => {
        render(
            <Toast
                title="1명만 초대 가능해요"
                description="PRO 구독 시 여러 명 초대 가능"
                action={<button>구독하기</button>}
            />
        );
        expect(screen.getByText('1명만 초대 가능해요')).toBeInTheDocument();
        expect(screen.getByText('PRO 구독 시 여러 명 초대 가능')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '구독하기' })).toBeInTheDocument();
    });
});
