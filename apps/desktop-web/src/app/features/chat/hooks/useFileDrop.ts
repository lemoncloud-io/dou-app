import { useCallback, useRef, useState, type DragEvent } from 'react';

const carriesFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer.types).includes('Files');

const foldersIn = (data: DataTransfer, files: readonly File[]): ReadonlySet<File> => {
    const names = new Set(
        Array.from(data.items ?? [])
            .filter(item => item.kind === 'file')
            .map(item => item.webkitGetAsEntry?.())
            .filter(entry => entry?.isDirectory)
            .map(entry => entry?.name)
    );
    return new Set(files.filter(file => names.has(file.name)));
};

export const useFileDrop = (onFiles: (files: File[], folders: ReadonlySet<File>) => void) => {
    const [isDragging, setDragging] = useState(false);
    const depth = useRef(0);

    const onDragEnter = useCallback((event: DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
    }, []);

    const onDragOver = useCallback((event: DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }, []);

    const onDragLeave = useCallback((event: DragEvent) => {
        if (!carriesFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
    }, []);

    const onDrop = useCallback(
        (event: DragEvent) => {
            if (!carriesFiles(event)) return;
            event.preventDefault();
            depth.current = 0;
            setDragging(false);
            const files = Array.from(event.dataTransfer.files);
            if (files.length > 0) onFiles(files, foldersIn(event.dataTransfer, files));
        },
        [onFiles]
    );

    return { isDragging, dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
};
