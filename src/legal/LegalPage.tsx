import React from 'react';
import { COOKIES, LAST_UPDATED, LegalSection, OPERATOR, PRIVACY, TERMS } from './legalContent';
import './LegalPage.css';

export type LegalDocument = 'privacy' | 'terms' | 'cookies';

const DOCUMENTS: Record<LegalDocument, { title: string; standfirst: string; sections: LegalSection[] }> = {
    privacy: {
        title: 'Privacy',
        standfirst: 'What this site stores, what it sends anywhere else, and what it does not do.',
        sections: PRIVACY,
    },
    terms: {
        title: 'Terms',
        standfirst: 'What TravelHub is, what its numbers mean, and what it does not promise.',
        sections: TERMS,
    },
    cookies: {
        title: 'Cookies',
        standfirst: 'Why there is no cookie banner here.',
        sections: COOKIES,
    },
};

/**
 * Inline code spans are written as `backticks` in the source text so the
 * storage keys stay legible without any markdown dependency.
 */
const renderText = (text: string): React.ReactNode => text.split('`').map((part, index) => (
    index % 2 === 1 ? <code key={index}>{part}</code> : <React.Fragment key={index}>{part}</React.Fragment>
));

const LegalPage: React.FC<{ document: LegalDocument }> = ({ document: name }) => {
    const doc = DOCUMENTS[name];

    return (
        <div className="legal-page">
            <header className="legal-page__header">
                <p className="legal-page__eyebrow">Legal</p>
                <h1>{doc.title}</h1>
                <p className="legal-page__standfirst">{doc.standfirst}</p>
                <p className="legal-page__meta">Last updated {LAST_UPDATED}</p>
            </header>

            {doc.sections.map((section) => (
                <section key={section.heading} className="legal-section">
                    <h2>{section.heading}</h2>
                    {section.paragraphs?.map((paragraph) => (
                        <p key={paragraph}>{renderText(paragraph)}</p>
                    ))}
                    {section.bullets && (
                        <ul>
                            {section.bullets.map((bullet) => <li key={bullet}>{renderText(bullet)}</li>)}
                        </ul>
                    )}
                </section>
            ))}

            <section className="legal-section">
                <h2>Contact</h2>
                <p>
                    Questions about any of this, or a request about your data:{' '}
                    <a href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>.
                </p>
                {!OPERATOR.postalAddress && (
                    <p className="legal-page__gap">
                        A registered postal address and the operating legal entity still have to be
                        published here before this site collects data from the public.
                    </p>
                )}
            </section>
        </div>
    );
};

export default LegalPage;
