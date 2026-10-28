import { BottomSheet, IconCheck, ListRow } from '@chatic/web-ui-kit';

import type { ShareOption } from '../hooks/useShareCloud';

interface ShareOptionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    options: ShareOption[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}

/** A one-of list in a sheet — the cloud or the place the share goes into. */
export const ShareOptionSheet = ({
    open,
    onOpenChange,
    title,
    options,
    selectedId,
    onSelect,
}: ShareOptionSheetProps) => (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} showHandle>
        <div className="pb-[calc(var(--safe-bottom,0px)+0.5rem)]">
            {options.map(option => (
                <ListRow
                    key={option.id}
                    title={option.name}
                    aria-current={option.id === selectedId ? 'true' : undefined}
                    trailing={option.id === selectedId ? <IconCheck className="size-5 text-foreground" /> : undefined}
                    onClick={() => {
                        onOpenChange(false);
                        onSelect(option.id);
                    }}
                />
            ))}
        </div>
    </BottomSheet>
);
