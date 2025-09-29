import React, { useEffect, useState } from 'react';

interface ProcessingStatusProps {
status: {
    moderation: string;
    transcription: string;
    comprehend: string;
};
processingTime: number;
timeoutDuration: number;
}

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
status,
processingTime,
timeoutDuration
}) => {
const [backendStatus, setBackendStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');

useEffect(() => {
    const controller = new AbortController();
    fetch('/api/moderation/video/status', { signal: controller.signal })
        .then(() => setBackendStatus('ok'))
        .catch(() => setBackendStatus('error'));
    return () => controller.abort();
}, []);

return (
    <div className="processing-status">
        {(Object.entries(status) as [string, string][]).map(([key, value]) => (
            value && (
                <div key={key} className="status-message">
                    <span className="status-label">
                        {key.charAt(0).toUpperCase() + key.slice(1)}:
                    </span>
                    {value}
                </div>
            )
        ))}
        <div className="status-message">
            <span className="status-label">Backend:</span>
            {backendStatus === 'ok' ? 'Online' : backendStatus === 'error' ? 'Offline' : 'Checking...'}
        </div>
        <div className="progress-bar">
            <div 
                className="progress-bar-fill" 
                style={{ 
                    width: `${Math.min(100, (processingTime / timeoutDuration) * 100)}%` 
                }} 
            />
        </div>
    </div>
);
};