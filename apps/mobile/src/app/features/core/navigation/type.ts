import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
    Main: NavigatorScreenParams<MainStackParamList>;
};

export type MainStackParamList = {
    Main:
        | {
              url?: string;
              error?: string;
          }
        | undefined;
};

export type ModalScreenParams = {
    url: string;
    type: 'full' | 'sheet';
    heightRatio?: number;
    dragHandle?: boolean;
};
