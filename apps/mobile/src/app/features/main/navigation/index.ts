import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../core/navigation';

// MainScreen is hosted directly by RootNavigator as the single native stack's `Main` screen; the
// dedicated MainNavigator layer was removed for boot performance (see boot-optimization.md 4.3).
export type MainScreenProps = NativeStackScreenProps<RootStackParamList, 'Main'>;
