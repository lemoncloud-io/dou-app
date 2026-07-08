import { DBBrowser } from './DBBrowser';

/** Thin wrapper adding sheet padding around the cache DB browser. */
export const DBBrowserScreen = () => (
    <div className="p-4">
        <DBBrowser />
    </div>
);
