import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './type';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
