import { useColorScheme } from 'react-native';
import { useThemeStore } from '../stores';

export type ResolvedTheme = 'dark' | 'light';

export const getThemeBackgroundColor = (isDark: boolean) => (isDark ? '#121212' : '#FFFFFF');

export const useResolvedTheme = (): { resolvedTheme: ResolvedTheme; isDark: boolean; backgroundColor: string } => {
    const systemColorScheme = useColorScheme();
    const theme = useThemeStore(state => state.theme);
    const resolvedTheme: ResolvedTheme =
        theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark') ? 'dark' : 'light';
    const isDark = resolvedTheme === 'dark';

    return {
        resolvedTheme,
        isDark,
        backgroundColor: getThemeBackgroundColor(isDark),
    };
};
