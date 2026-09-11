import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { SheetAction } from './SheetAction';

describe('SheetAction — 바텀시트 액션 줄', () => {
    it('글리프와 라벨을 보여준다', () => {
        render(<SheetAction icon={<span data-testid="glyph" />} label="메시지 복사" />);

        expect(screen.getByTestId('glyph')).toBeInTheDocument();
        expect(screen.getByText('메시지 복사')).toBeInTheDocument();
    });

    it('글리프가 없어도 라벨만으로 선다', () => {
        render(<SheetAction label="메시지 복사" />);

        expect(screen.getByRole('button')).toHaveTextContent('메시지 복사');
    });

    // SheetOption의 형제이지 변종이 아니다 — 그건 값을 고르는 radio, 이건 실행하고 닫힌다.
    it('radio가 아니라 평범한 버튼이다', () => {
        render(<SheetAction label="메시지 복사" />);

        expect(screen.queryByRole('radio')).toBeNull();
        expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('탭하면 onClick이 불린다', () => {
        const onClick = jest.fn();
        render(<SheetAction label="메시지 복사" onClick={onClick} />);

        fireEvent.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('disabled면 눌러도 아무 일이 없다', () => {
        const onClick = jest.fn();
        render(<SheetAction label="메시지 복사" disabled onClick={onClick} />);

        fireEvent.click(screen.getByRole('button'));
        expect(onClick).not.toHaveBeenCalled();
    });
});
