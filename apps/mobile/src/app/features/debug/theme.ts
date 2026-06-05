import { useMemo } from 'react';
import { useResolvedTheme } from '../../theme';

export const useDebugTheme = () => {
    const { isDark } = useResolvedTheme();

    return useMemo(
        () => ({
            isDark,
            background: isDark ? '#121212' : '#FFFFFF',
            surface: isDark ? '#1E1E1E' : '#F4F6F8',
            surfaceAlt: isDark ? '#181818' : '#FFFFFF',
            logBackground: isDark ? '#000000' : '#F7F9FB',
            text: isDark ? '#FFFFFF' : '#111827',
            mutedText: isDark ? '#AAAAAA' : '#4B5563',
            subtleText: isDark ? '#888888' : '#6B7280',
            border: isDark ? '#333333' : '#D9DEE5',
            divider: isDark ? '#444444' : '#D0D7DE',
        }),
        [isDark]
    );
};
