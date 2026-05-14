import { AppIconBridge } from '../../bridge';
import type { IKeyValueStorage } from '../../database';
import type { AppIconOption, IDynamicAppIconService } from './types';
import { AVAILABLE_ICONS, DEFAULT_APP_ICON_NAME } from './types';
import type { ILogService } from '../log';

const ICON_STORAGE_KEY = '@app_current_icon_name';

export class DynamicAppIconService implements IDynamicAppIconService {
    constructor(
        private readonly logger: ILogService,
        private readonly storage: IKeyValueStorage
    ) {}

    getAvailableIcons(): AppIconOption[] {
        return AVAILABLE_ICONS;
    }

    async fetchCurrentIcon(): Promise<string> {
        try {
            const storedIconName = await this.storage.get<string>(ICON_STORAGE_KEY);
            return storedIconName || DEFAULT_APP_ICON_NAME;
        } catch (error) {
            this.logger.error('APP_ICON', 'Failed to fetch current icon from MMKV', error);
            return DEFAULT_APP_ICON_NAME;
        }
    }

    async setAppIcon(targetIconName?: string | null): Promise<boolean> {
        try {
            const isDefault = !targetIconName || targetIconName === DEFAULT_APP_ICON_NAME;
            const targetName = isDefault ? 'DefaultIcon' : targetIconName;

            const currentIcon = await this.fetchCurrentIcon();

            if (targetName === currentIcon) {
                return true;
            }

            await AppIconBridge.changeIcon(targetName, currentIcon);
            await this.storage.set<string>(ICON_STORAGE_KEY, targetName);

            this.logger.info('APP_ICON', `Icon successfully changed to: ${targetName}`);
            return true;
        } catch (error) {
            this.logger.error('APP_ICON', `Failed to set app icon to ${targetIconName}`, error);
            return false;
        }
    }
}
