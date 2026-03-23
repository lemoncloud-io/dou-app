import type { PolicySection as PolicySectionType } from '../constants';

interface PolicySectionProps {
    section: PolicySectionType;
    index: number;
}

export const PolicySection = ({ section }: PolicySectionProps): JSX.Element => {
    return (
        <section className="space-y-3 sm:space-y-4">
            <h3 className="text-[18px] sm:text-[22px] xl:text-[26px] font-bold text-gray-900">{section.title}</h3>
            <p className="text-[14px] sm:text-[16px] xl:text-[18px] text-gray-700 leading-relaxed whitespace-pre-line">
                {section.content}
            </p>

            {section.subsections && section.subsections.length > 0 && (
                <div className="ml-4 sm:ml-6 space-y-3 sm:space-y-4 mt-4">
                    {section.subsections.map((subsection, subIndex) => (
                        <div key={subIndex} className="space-y-2">
                            <h4 className="text-[16px] sm:text-[18px] xl:text-[20px] font-semibold text-gray-800">
                                {subsection.title}
                            </h4>
                            <p className="text-[14px] sm:text-[16px] text-gray-600 leading-relaxed whitespace-pre-line">
                                {subsection.content}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};
