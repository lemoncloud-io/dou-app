import { useCallback, useMemo } from 'react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import { normalizeHomeSectionsCollapsed } from '../../../stores/preferenceParsers';
import type { HomeSectionId } from '../../../stores/preferenceKeys';

/**
 * `ui.homeSectionsCollapsed` is `persist: 'local'`, `writableBy: ['local']`, like the other home
 * preferences. Reads the stored record at write time rather than taking it from the render, so two
 * toggles in one tick cannot overwrite each other.
 */
export const setHomeSectionOpen = (section: HomeSectionId, open: boolean): void => {
    const { [section]: _previous, ...rest } = normalizeHomeSectionsCollapsed(config.get('ui.homeSectionsCollapsed'));
    config.set('ui.homeSectionsCollapsed', open ? rest : { ...rest, [section]: true }, { lane: 'local' });
};

/**
 * Whether each home section (Place, Chat, cloud 1:1) is expanded. The answer lives in the config
 * store rather than in each section's own state, so a fold survives what used to reset it: the
 * place list swapping its skeleton for the loaded list, leaving home and coming back, a reload.
 *
 * One record for the whole app, not one per cloud or place — folding "Chat" is a statement about
 * how a person uses home, not about one place's rooms.
 */
export const useHomeSections = () => {
    const raw = useConfigValue('ui.homeSectionsCollapsed');
    const collapsed = useMemo(() => normalizeHomeSectionsCollapsed(raw), [raw]);
    const isOpen = useCallback((section: HomeSectionId) => !collapsed[section], [collapsed]);
    return { isOpen, setOpen: setHomeSectionOpen };
};
