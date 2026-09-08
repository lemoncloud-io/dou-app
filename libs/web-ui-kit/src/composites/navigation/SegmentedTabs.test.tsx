import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { SegmentedTabs } from './SegmentedTabs';

const ITEMS = [
    { id: 'place', label: '플레이스' },
    { id: 'contact', label: '연락처' },
];

describe('SegmentedTabs', () => {
    it('탭을 모두 렌더하고 선택된 것만 aria-selected다', () => {
        render(<SegmentedTabs items={ITEMS} value="place" onChange={jest.fn()} />);

        expect(screen.getByRole('tab', { name: '플레이스' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: '연락처' })).toHaveAttribute('aria-selected', 'false');
    });

    it('탭을 누르면 그 id로 onChange를 부른다', () => {
        const onChange = jest.fn();
        render(<SegmentedTabs items={ITEMS} value="place" onChange={onChange} />);

        fireEvent.click(screen.getByRole('tab', { name: '연락처' }));

        expect(onChange).toHaveBeenCalledWith('contact');
    });

    // 활성 탭만 탭 스톱이라, Tab으로 한 번 들어온 뒤 화살표로 이동한다.
    it('활성 탭만 tabIndex 0을 갖는다', () => {
        render(<SegmentedTabs items={ITEMS} value="contact" onChange={jest.fn()} />);

        expect(screen.getByRole('tab', { name: '연락처' })).toHaveAttribute('tabindex', '0');
        expect(screen.getByRole('tab', { name: '플레이스' })).toHaveAttribute('tabindex', '-1');
    });

    it('오른쪽 화살표로 다음 탭을 고른다', () => {
        const onChange = jest.fn();
        render(<SegmentedTabs items={ITEMS} value="place" onChange={onChange} />);

        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });

        expect(onChange).toHaveBeenCalledWith('contact');
    });

    // 양 끝에서 감긴다 — tablist가 기대받는 동작이다.
    it('마지막 탭에서 오른쪽 화살표는 처음으로 감긴다', () => {
        const onChange = jest.fn();
        render(<SegmentedTabs items={ITEMS} value="contact" onChange={onChange} />);

        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });

        expect(onChange).toHaveBeenCalledWith('place');
    });

    it('첫 탭에서 왼쪽 화살표는 마지막으로 감긴다', () => {
        const onChange = jest.fn();
        render(<SegmentedTabs items={ITEMS} value="place" onChange={onChange} />);

        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });

        expect(onChange).toHaveBeenCalledWith('contact');
    });

    it('Home·End로 양 끝으로 간다', () => {
        const onChange = jest.fn();
        render(<SegmentedTabs items={ITEMS} value="contact" onChange={onChange} />);

        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Home' });
        expect(onChange).toHaveBeenCalledWith('place');

        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' });
        expect(onChange).toHaveBeenCalledWith('contact');
    });

    it('관계없는 키는 무시한다', () => {
        const onChange = jest.fn();
        render(<SegmentedTabs items={ITEMS} value="place" onChange={onChange} />);

        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'a' });

        expect(onChange).not.toHaveBeenCalled();
    });

    // value가 목록에 없을 때(잘못된 초기값)도 화살표가 죽지 않아야 한다.
    it('value가 목록에 없으면 화살표는 첫 탭 기준으로 움직인다', () => {
        const onChange = jest.fn();
        render(<SegmentedTabs items={ITEMS} value="없는탭" onChange={onChange} />);

        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });

        expect(onChange).toHaveBeenCalledWith('contact');
    });
});

describe('SegmentedTabs — 포커스', () => {
    // roving tabindex가 탭 스톱을 옮기므로 DOM 포커스도 따라가야 한다. 안 따라가면 포커스가
    // tabIndex=-1 인 버튼에 남아 Tab으로 다시 닿을 수 없는 자리에 갇힌다.
    it('화살표로 옮기면 새 탭에 포커스가 간다', () => {
        const Harness = () => {
            const [value, setValue] = require('react').useState('place');
            return <SegmentedTabs items={ITEMS} value={value} onChange={setValue} />;
        };
        render(<Harness />);

        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });

        expect(screen.getByRole('tab', { name: '연락처' })).toHaveFocus();
    });
});
