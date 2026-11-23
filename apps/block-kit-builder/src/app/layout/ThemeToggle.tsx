import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@chatic/theme';
import { cn } from '@chatic/ui-kit';

export const ThemeToggle = () => {
    const { isDarkTheme, setTheme } = useTheme();

    return (
        <button
            type="button"
            onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
            aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
            className={cn(
                'focus-ring tactile flex h-8 w-8 items-center justify-center rounded-md',
                'text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground'
            )}
        >
            {isDarkTheme ? <Sun size={16} /> : <Moon size={16} />}
        </button>
    );
};
