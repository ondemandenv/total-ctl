import React from 'react';

interface LanguageDisplayProps {
languages: Array<{
    languageCode: string;
    confidence: number;
}>;
}

export const LanguageDisplay: React.FC<LanguageDisplayProps> = ({ languages }) => {
  // Filter out any invalid languages and sort by confidence
  const sortedLanguages = [...languages]
      .filter(lang => lang.languageCode && lang.languageCode !== 'undefined')
      .sort((a, b) => b.confidence - a.confidence);
  
  return (
      <div className="language-info">
          {sortedLanguages.map((lang, index) => {
              const isHighConfidence = index === 0 && lang.confidence > 0.5;
              const confidencePercent = (lang.confidence * 100).toFixed(1);
              
              return (
                  <span 
                      key={`${lang.languageCode}-${index}`}
                      className={`language-tag ${isHighConfidence ? 'high-confidence' : ''}`}
                  >
                      {lang.languageCode} ({confidencePercent}%)
                  </span>
              );
          })}
      </div>
  );
  };