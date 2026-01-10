/**
 * EscalationPrompt Component
 * 
 * Shows escalation offer when project access is denied
 * and handles escalation request submission
 */

import React, { useState } from 'react';
import { SystemName, AccessLevel } from '../types/access';
import { submitEscalationRequest } from '../services/api';

interface EscalationPromptProps {
  projectName: string;
  system: SystemName;
  accessLevel: AccessLevel;
  escalationTo: string;
  onEscalationSubmitted: (escalationId: string) => void;
}

export const EscalationPrompt: React.FC<EscalationPromptProps> = ({
  projectName,
  system,
  accessLevel,
  escalationTo,
  onEscalationSubmitted
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Get userId from context or props - for now using a placeholder
      // In real implementation, this would come from user context
      const userId = 'intern-001'; // This should come from props or context
      const projectId = projectName === 'Project Alpha' ? 'project-1' : 'project-2';

      const response = await submitEscalationRequest(
        userId,
        projectId,
        system,
        accessLevel
      );

      onEscalationSubmitted(response.escalationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit escalation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
      <div className="flex items-start">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">
            Escalation Required
          </h3>
          <p className="text-sm text-yellow-700 mb-3">
            You are not assigned to {projectName}. To request {accessLevel} access to {system}, 
            we can escalate this request to the project manager ({escalationTo}).
          </p>
          {error && (
            <p className="text-sm text-red-600 mb-2">{error}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Escalation Request'}
          </button>
        </div>
      </div>
    </div>
  );
};

