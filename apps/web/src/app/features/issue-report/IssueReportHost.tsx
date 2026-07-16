import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreferenceStore } from '../../stores/usePreferenceStore';
import { IssueReportFab, IssueReportOverlay } from './components';

/**
 * Single entry point for the floating issue-report widget. Renders the draggable
 * FAB (unless the user hid it) and, while open, the report overlay in its place.
 * Mounted once under AppRuntime beside the Router.
 */
export const IssueReportHost = () => {
    const { t } = useTranslation();
    const hidden = usePreferenceStore(s => s.issueReportHidden);
    const [isOpen, setIsOpen] = useState(false);

    if (hidden) return null;

    return isOpen ? (
        <IssueReportOverlay onClose={() => setIsOpen(false)} />
    ) : (
        <IssueReportFab label={t('issueReport.open')} onOpen={() => setIsOpen(true)} />
    );
};
