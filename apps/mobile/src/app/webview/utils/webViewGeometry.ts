import type { EdgeInsets } from 'react-native-safe-area-context';

export const toWebViewInsets = (
    insets: EdgeInsets
): { padding: { paddingLeft: number; paddingRight: number }; web: EdgeInsets } => ({
    padding: { paddingLeft: insets.left, paddingRight: insets.right },
    web: { top: insets.top, bottom: insets.bottom, left: 0, right: 0 },
});
