import { BuilderLayout } from './layout';

// Every pane is empty until slice 04 gives them a block array to share. The shell
// ships first so the panes are laid out against real content widths rather than
// against whatever the first feature happens to render.
const Empty = ({ children }: { children: string }) => (
    <p className="px-4 py-2 text-callout text-muted-foreground">{children}</p>
);

export const App = () => (
    <BuilderLayout
        rail={<Empty>No blocks yet.</Empty>}
        preview={<Empty>Add a block to see the message.</Empty>}
        payload={<Empty>The JSON appears here.</Empty>}
    />
);
