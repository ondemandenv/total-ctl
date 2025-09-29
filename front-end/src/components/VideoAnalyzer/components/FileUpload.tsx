import React from 'react';

interface FileUploadProps {
onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
isProcessing: boolean;
includeLabelDetection: boolean;
onLabelDetectionChange: (checked: boolean) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({
onFileChange,
isProcessing,
includeLabelDetection,
onLabelDetectionChange
}) => {
return (
    <div className="upload-section">
        <div className="toggle-container">
            <label className="toggle-switch">
                <input
                    type="checkbox"
                    checked={includeLabelDetection}
                    onChange={(e) => onLabelDetectionChange(e.target.checked)}
                    disabled={isProcessing}
                />
                <span className="toggle-slider"></span>
            </label>
            <span className="toggle-label">Include Object & Activity Detection</span>
        </div>

        <input
            type="file"
            accept="video/*"
            onChange={onFileChange}
            disabled={isProcessing}
        />
    </div>
);
};