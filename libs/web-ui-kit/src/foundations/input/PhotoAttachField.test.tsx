import { fireEvent, render, screen } from '@testing-library/react';

import { PhotoAttachField } from './PhotoAttachField';

const IMAGE = 'data:image/jpeg;base64,AAAA';

const fileInput = (container: HTMLElement) => container.querySelector('input[type="file"]') as HTMLInputElement;
const makeFile = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

describe('PhotoAttachField', () => {
    it('renders the label, hint and description', () => {
        render(
            <PhotoAttachField
                label="사진 첨부"
                value={[]}
                onSelect={jest.fn()}
                onRemove={jest.fn()}
                hint="이미지를 첨부해주세요."
                description="최대 5장"
            />
        );

        expect(screen.getByText('사진 첨부')).toBeInTheDocument();
        expect(screen.getByText('이미지를 첨부해주세요.')).toBeInTheDocument();
        expect(screen.getByText('최대 5장')).toBeInTheDocument();
    });

    // The field reports every pick, over-limit included, so the owner can explain the refusal.
    it('hands back every picked file rather than trimming to `max` itself', () => {
        const onSelect = jest.fn();
        const { container } = render(
            <PhotoAttachField label="사진" value={[IMAGE]} onSelect={onSelect} onRemove={jest.fn()} max={2} />
        );

        fireEvent.change(fileInput(container), { target: { files: [makeFile('a.jpg'), makeFile('b.jpg')] } });

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0][0]).toHaveLength(2);
    });

    // Without this, re-picking the file you just removed fires no change event at all.
    it('clears the input value so the same file can be picked twice', () => {
        const { container } = render(
            <PhotoAttachField label="사진" value={[]} onSelect={jest.fn()} onRemove={jest.fn()} />
        );
        const input = fileInput(container);

        fireEvent.change(input, { target: { files: [makeFile('a.jpg')] } });

        expect(input.value).toBe('');
    });

    it('ignores an empty pick (dialog cancelled)', () => {
        const onSelect = jest.fn();
        const { container } = render(
            <PhotoAttachField label="사진" value={[]} onSelect={onSelect} onRemove={jest.fn()} />
        );

        fireEvent.change(fileInput(container), { target: { files: [] } });

        expect(onSelect).not.toHaveBeenCalled();
    });

    it('renders a thumbnail per value and removes by index', () => {
        const onRemove = jest.fn();
        render(
            <PhotoAttachField
                label="사진"
                value={[IMAGE, `${IMAGE}BBB`]}
                onSelect={jest.fn()}
                onRemove={onRemove}
                removeLabel={index => `${index}번째 삭제`}
            />
        );

        expect(document.querySelectorAll('img')).toHaveLength(2);
        fireEvent.click(screen.getByRole('button', { name: '2번째 삭제' }));
        expect(onRemove).toHaveBeenCalledWith(1);
    });

    it('hides the dropzone once `max` is reached', () => {
        const { rerender } = render(
            <PhotoAttachField
                label="사진"
                value={[IMAGE]}
                onSelect={jest.fn()}
                onRemove={jest.fn()}
                hint="첨부"
                max={2}
            />
        );
        expect(screen.getByText('첨부')).toBeInTheDocument();

        rerender(
            <PhotoAttachField
                label="사진"
                value={[IMAGE, IMAGE]}
                onSelect={jest.fn()}
                onRemove={jest.fn()}
                hint="첨부"
                max={2}
            />
        );
        expect(screen.queryByText('첨부')).not.toBeInTheDocument();
    });
});
