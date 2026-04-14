export interface PolicySection {
    title: string;
    content: string;
    subsections?: PolicySection[];
}

export interface PolicyVersion {
    version: string;
    effectiveDate: string;
    sections: PolicySection[];
}

export interface PolicyContent {
    title: string;
    subtitle: string;
    currentVersion: string;
    versions: PolicyVersion[];
}

export type SupportedLanguage = 'ko' | 'en';
