import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './type';

/**
 * Shared navigation container ref. Lives in its own leaf module (no navigator imports) so code
 * outside the React tree — notably the deep link coordinator — can drive native routes without a
 * circular import through the navigator graph.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
