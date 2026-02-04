import { AppRegistry } from 'react-native';

import messaging from '@react-native-firebase/messaging';

import App from './app/App';

messaging().setBackgroundMessageHandler(async _ => ({}));

AppRegistry.registerComponent('Chatic', () => App);
