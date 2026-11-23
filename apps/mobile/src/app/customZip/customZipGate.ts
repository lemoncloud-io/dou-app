import Config from 'react-native-config';

export const isCustomZipAllowed = (): boolean => Config.VITE_ENV !== 'PROD';
