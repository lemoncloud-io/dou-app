import { ConsoleHeader } from '../components/console/ConsoleHeader';
import { useConsoleNav } from '../hooks/use-console-nav';
import { AllLogsTab } from '../tabs/AllLogsTab';
import { ErrorsTab } from '../tabs/ErrorsTab';
import { ReportsTab } from '../tabs/ReportsTab';
import { StatsTab } from '../tabs/StatsTab';
import { UserTab } from '../tabs/UserTab';

export const ReportLogsPage = () => {
    const nav = useConsoleNav();

    const body = (() => {
        switch (nav.tab) {
            case 'errors':
                return <ErrorsTab nav={nav} />;
            case 'reports':
                return <ReportsTab nav={nav} />;
            case 'stats':
                return <StatsTab nav={nav} />;
            case 'all':
                return <AllLogsTab />;
            default:
                return <UserTab nav={nav} />;
        }
    })();

    return (
        <div className="flex h-full min-h-0 flex-col bg-background text-sm text-foreground">
            <ConsoleHeader
                tab={nav.tab}
                onTab={tab => tab !== nav.tab && nav.go(tab)}
                stage={nav.stage}
                onStage={nav.setStage}
            />
            <div className="flex min-h-0 flex-1 flex-col">{body}</div>
        </div>
    );
};
