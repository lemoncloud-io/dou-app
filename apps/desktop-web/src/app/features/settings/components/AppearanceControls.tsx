import { useCallback, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleCheck } from 'lucide-react';

import { cn } from '@chatic/ui-kit';
import { type Theme, useTheme } from '@chatic/theme';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    radioGroupOptions,
    FONT_SIZES,
    MESSAGE_DENSITIES,
    PALETTES,
    PALETTE_CHOICES,
    PRESET_COLORS,
    type PaletteChoice,
    type ShellColors,
    colorsOf,
    shellPaletteCss,
    useAppearancePrefsStore,
} from '../../../shared';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, setLanguage } from '../../../../i18n';
import { CustomPaletteFields } from './CustomPaletteFields';

const SEGMENT_BUTTON =
    'focus-ring tactile flex-1 rounded-lg border px-4 py-2 text-callout transition-colors ease-tactile';
const segmentTone = (checked: boolean): string =>
    checked
        ? 'border-primary-ink bg-primary/10 font-semibold text-foreground'
        : 'border-control-border text-muted-foreground hover:bg-accent';

const THEME_OPTIONS: Theme[] = ['light', 'dark', 'system'];

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES;

const THEME_SWATCH: Record<Theme, string> = {
    light: 'border-swatch-border bg-swatch-light',
    dark: 'border-swatch-border bg-swatch-dark',
    system: 'border-swatch-border bg-swatch-light',
};

export const AppearanceControls = ({ className }: { className?: string }) => {
    const { t, i18n } = useTranslation();
    const uid = useId();
    const { theme, setTheme } = useTheme();
    const themeProps = radioGroupOptions(THEME_OPTIONS, theme, setTheme);
    const languageProps = radioGroupOptions(LANGUAGE_OPTIONS, i18n.language, setLanguage);
    const fontSize = useAppearancePrefsStore(s => s.fontSize);
    const setFontSize = useAppearancePrefsStore(s => s.setFontSize);
    const density = useAppearancePrefsStore(s => s.density);
    const setDensity = useAppearancePrefsStore(s => s.setDensity);
    const fontSizeProps = radioGroupOptions(FONT_SIZES, fontSize, setFontSize);
    const densityProps = radioGroupOptions(MESSAGE_DENSITIES, density, setDensity);
    const palette = useAppearancePrefsStore(s => s.palette);
    const customPalette = useAppearancePrefsStore(s => s.customPalette);
    const setPalette = useAppearancePrefsStore(s => s.setPalette);
    const setCustomPalette = useAppearancePrefsStore(s => s.setCustomPalette);
    const customColors = customPalette ?? colorsOf({ palette, customPalette });
    const announcePalette = useCallback(() => toast({ title: t('settings.palette.applied') }), [t]);
    const pickPalette = (next: PaletteChoice) => {
        if (next === palette) return;
        if (next === 'custom') setCustomPalette(customColors);
        else setPalette(next);
        announcePalette();
    };
    const paletteProps = radioGroupOptions(PALETTE_CHOICES, palette, pickPalette);
    const presetPreviewCss = useMemo(
        () =>
            PALETTES.map(option =>
                shellPaletteCss(PRESET_COLORS[option], `[data-palette-preview='${option}']`, {
                    dark: option !== 'mist',
                })
            ).join('\n'),
        []
    );
    const previewCss = `${presetPreviewCss}\n${shellPaletteCss(customColors, "[data-palette-preview='custom']", { dark: true })}`;
    const pickCustomColors = (colors: ShellColors) => setCustomPalette(colors);

    return (
        <div className={cn('flex flex-col gap-6', className)}>
            <div className="flex flex-col gap-2.5">
                <span id={`${uid}-theme-label`} className="text-callout font-medium text-foreground">
                    {t('settings.theme')}
                </span>
                <div role="radiogroup" aria-labelledby={`${uid}-theme-label`} className="flex gap-2">
                    {THEME_OPTIONS.map(option => (
                        <button
                            key={option}
                            type="button"
                            {...themeProps(option)}
                            className={cn(
                                'focus-ring tactile flex flex-1 flex-col items-center gap-2 rounded-lg border p-3 text-callout capitalize transition-colors ease-tactile',
                                theme === option
                                    ? 'border-primary-ink bg-primary/10 font-semibold text-foreground'
                                    : 'border-control-border text-muted-foreground hover:bg-accent'
                            )}
                        >
                            <span
                                aria-hidden
                                className={cn('flex h-6 w-10 overflow-hidden rounded-md border', THEME_SWATCH[option])}
                            >
                                {option === 'system' && <span className="h-full w-1/2 bg-swatch-dark" />}
                            </span>
                            {t(`settings.theme.${option}`)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1">
                    <span id={`${uid}-palette-label`} className="text-callout font-medium text-foreground">
                        {t('settings.palette')}
                    </span>
                    <span id={`${uid}-palette-hint`} className="text-caption text-muted-foreground">
                        {t('settings.palette.hint')}
                    </span>
                </div>
                <style>{previewCss}</style>
                <div
                    role="radiogroup"
                    aria-labelledby={`${uid}-palette-label`}
                    aria-describedby={`${uid}-palette-hint`}
                    className="flex flex-wrap gap-2"
                >
                    {PALETTE_CHOICES.map(option => {
                        const name = t(`settings.palette.${option}`);
                        return (
                            <button
                                key={option}
                                type="button"
                                {...paletteProps(option)}
                                className={cn(
                                    'focus-ring tactile flex w-32 flex-col gap-2 rounded-xl border p-2 text-left text-callout transition-colors ease-tactile',
                                    segmentTone(palette === option)
                                )}
                            >
                                <span
                                    aria-hidden
                                    data-palette-preview={option}
                                    className="flex h-14 overflow-hidden rounded-lg border border-swatch-border"
                                >
                                    <span className="w-[9px] bg-rail" />
                                    <span className="w-3 bg-rail-elevated" />
                                    <span className="flex flex-1 bg-sidebar py-1.5 pl-5 pr-1.5">
                                        <span className="flex-1 rounded-sm bg-background" />
                                    </span>
                                </span>
                                <span className="flex items-center justify-between gap-1 px-0.5">
                                    {option === 'mist' ? t('settings.palette.default', { name }) : name}
                                    {palette === option && (
                                        <CircleCheck size={16} aria-hidden className="shrink-0 text-primary-ink" />
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>
                {palette === 'custom' && (
                    <CustomPaletteFields colors={customColors} onPick={pickCustomColors} onSet={announcePalette} />
                )}
            </div>

            <div className="flex flex-col gap-2.5">
                <span id={`${uid}-font-size-label`} className="text-callout font-medium text-foreground">
                    {t('settings.fontSize')}
                </span>
                <div role="radiogroup" aria-labelledby={`${uid}-font-size-label`} className="flex gap-2">
                    {FONT_SIZES.map(option => (
                        <button
                            key={option}
                            type="button"
                            {...fontSizeProps(option)}
                            className={cn(SEGMENT_BUTTON, segmentTone(fontSize === option))}
                        >
                            {t(`settings.fontSize.${option}`)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-2.5">
                <span id={`${uid}-density-label`} className="text-callout font-medium text-foreground">
                    {t('settings.density')}
                </span>
                <div role="radiogroup" aria-labelledby={`${uid}-density-label`} className="flex gap-2">
                    {MESSAGE_DENSITIES.map(option => (
                        <button
                            key={option}
                            type="button"
                            {...densityProps(option)}
                            className={cn(SEGMENT_BUTTON, segmentTone(density === option))}
                        >
                            {t(`settings.density.${option}`)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-2.5">
                <span className="text-callout font-medium text-foreground">{t('settings.preview')}</span>
                <div
                    data-testid="appearance-preview"
                    data-font-size={fontSize}
                    data-density={density}
                    className="flex flex-col rounded-lg border border-border bg-background px-3 py-2"
                >
                    {(['A', 'B'] as const).map(id => (
                        <div key={id} className="flex flex-col py-[var(--message-row-py)]">
                            <span className="text-lead font-bold leading-tight text-foreground">
                                {t(`settings.preview.name${id}`)}
                            </span>
                            <span className="text-body text-foreground">{t(`settings.preview.message${id}`)}</span>
                        </div>
                    ))}
                </div>
            </div>

            {LANGUAGE_OPTIONS.length > 1 && (
                <div className="flex flex-col gap-2.5">
                    <span id={`${uid}-language-label`} className="text-callout font-medium text-foreground">
                        {t('settings.language')}
                    </span>
                    <div role="radiogroup" aria-labelledby={`${uid}-language-label`} className="flex gap-2">
                        {LANGUAGE_OPTIONS.map(lng => (
                            <button
                                key={lng}
                                type="button"
                                {...languageProps(lng)}
                                className={cn(
                                    'focus-ring tactile rounded-lg border px-4 py-2 text-callout transition-colors ease-tactile',
                                    i18n.language === lng
                                        ? 'border-primary-ink bg-primary/10 font-semibold text-foreground'
                                        : 'border-control-border text-muted-foreground hover:bg-accent'
                                )}
                            >
                                {LANGUAGE_LABELS[lng]}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
