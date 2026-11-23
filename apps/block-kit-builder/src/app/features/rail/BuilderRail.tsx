import { useBuilderStore } from '../../store';
import { BlockList } from '../editor';
import { TemplateList } from '../templates';
import { BlockPalette } from './BlockPalette';

const SECTION_HEADING = 'px-4 pb-2 pt-7 text-caption font-medium text-muted-foreground';

export const BuilderRail = () => {
    const count = useBuilderStore(state => state.blocks.length);

    return (
        <div className="flex h-full flex-col">
            <div className="shrink-0">
                <h3 className={`${SECTION_HEADING} pt-3 lg:hidden`}>Template</h3>
                <TemplateList />
                <h3 className={SECTION_HEADING}>UI Components</h3>
                <BlockPalette />
            </div>

            <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-hairline">
                <h3 className={SECTION_HEADING}>
                    Blocks in this message
                    {count > 0 && <span className="ml-1 tabular-nums text-muted-foreground/60">{count}</span>}
                </h3>
                <div className="min-h-0 flex-1 overflow-auto pb-4">
                    <BlockList />
                </div>
            </div>
        </div>
    );
};
