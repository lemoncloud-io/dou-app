import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { UpdatePromptDialog } from './UpdatePromptDialog';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('UpdatePromptDialog', () => {
    it('open이 false면 렌더하지 않는다', () => {
        render(<UpdatePromptDialog open={false} onDismiss={jest.fn()} onUpdate={jest.fn()} />);

        expect(screen.queryByText('appUpdate.title')).not.toBeInTheDocument();
    });

    it('open이 true면 제목/설명/버튼을 렌더한다', () => {
        render(<UpdatePromptDialog open={true} onDismiss={jest.fn()} onUpdate={jest.fn()} />);

        expect(screen.getByText('appUpdate.title')).toBeInTheDocument();
        expect(screen.getByText('appUpdate.description')).toBeInTheDocument();
        expect(screen.getByText('appUpdate.later')).toBeInTheDocument();
        expect(screen.getByText('appUpdate.update')).toBeInTheDocument();
    });

    it('"나중에"를 클릭하면 onDismiss가 호출된다', () => {
        const onDismiss = jest.fn();
        render(<UpdatePromptDialog open={true} onDismiss={onDismiss} onUpdate={jest.fn()} />);

        fireEvent.click(screen.getByText('appUpdate.later'));

        expect(onDismiss).toHaveBeenCalled();
    });

    it('"업데이트"를 클릭하면 onUpdate가 호출된다', () => {
        const onUpdate = jest.fn();
        render(<UpdatePromptDialog open={true} onDismiss={jest.fn()} onUpdate={onUpdate} />);

        fireEvent.click(screen.getByText('appUpdate.update'));

        expect(onUpdate).toHaveBeenCalled();
    });
});
