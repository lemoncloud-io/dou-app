import Config from 'react-native-config';

export const WEBVIEW_URL = __DEV__ ? 'http://192.168.1.13:5003' : Config.VITE_WEBVIEW_BASE_URL;
