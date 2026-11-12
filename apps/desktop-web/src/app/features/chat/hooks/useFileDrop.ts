import { useCallback, useRef, useState, type DragEvent } from 'react';

const carriesFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer.types).includes('Files');

/**
 * The dropped files that are folders. A folder arrives in `files` as an empty file named like the
 * folder; only its entry says what it is, and only during the drop event. Matched by name, as the
 * two lists are not promised to line up.
 */
const foldersIn = (data: DataTransfer, files: readonly File[]): ReadonlySet<File> => {
    const names = new Set(
        Array.from(data.items ?? [])
            .filter(item => item.kind === 'file')
            .map(item => item.webkitGetAsEntry?.())
            .filter(entry => entry?.isDirectory)
            .map(entry => entry?.name)
    );
    // By name alone: a folder named like a format (`photos.zip`) may arrive typed from that extension.
    return new Set(files.filter(file => names.has(file.name)));
};

/**
 * Drag-and-drop of files onto a pane. Counts enter/leave pairs because every child the
 * pointer crosses fires its own pair — a plain boolean flickers the overlay off the
 * moment the drag passes over a message. Text or link drags are ignored.
 */
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
        // Without this the browser treats the pane as not a drop target and opens the file.
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
