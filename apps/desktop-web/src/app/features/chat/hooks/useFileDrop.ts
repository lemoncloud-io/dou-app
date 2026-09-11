import { useCallback, useRef, useState, type DragEvent } from 'react';

const carriesFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer.types).includes('Files');

/**
 * Drag-and-drop of files onto a pane. Counts enter/leave pairs because every child the
 * pointer crosses fires its own pair — a plain boolean flickers the overlay off the
 * moment the drag passes over a message. Text or link drags are ignored.
 */
export const useFileDrop = (onFiles: (files: File[]) => void) => {
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
            if (files.length > 0) onFiles(files);
        },
        [onFiles]
    );

    return { isDragging, dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
};
