import { BlockList } from '../editor';
import { BlockPalette } from './BlockPalette';

/** The palette, then the message being built. Add at the top, edit below it. */
export const BuilderRail = () => (
    <div className="flex flex-col gap-3 pb-4">
        <BlockPalette />
        <div className="border-t border-hairline pt-1">
            <BlockList />
        </div>
    </div>
);
