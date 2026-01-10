/**
 * NextActionPrompt Component
 * 
 * Displays what action is needed next
 */

import React from 'react';

interface NextActionPromptProps {
  nextAction: string;
  missingFields?: string[];
}

export const NextActionPrompt: React.FC<NextActionPromptProps> = ({ 
  nextAction,
  missingFields 
}) => {
  if (!nextAction && (!missingFields || missingFields.length === 0)) {
    return null;
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
      <p className="text-sm text-blue-800 font-medium">
        {nextAction || (missingFields && missingFields.length > 0 
          ? `Need: ${missingFields[0]}` 
          : 'Ready to proceed')}
      </p>
    </div>
  );
};

