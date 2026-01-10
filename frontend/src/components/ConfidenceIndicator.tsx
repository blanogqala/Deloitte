/**
 * ConfidenceIndicator Component
 * 
 * Displays agent confidence level
 */

import React from 'react';
import { AgentConfidence } from '../types/access';

interface ConfidenceIndicatorProps {
  confidence: AgentConfidence;
}

export const ConfidenceIndicator: React.FC<ConfidenceIndicatorProps> = ({ confidence }) => {
  const getConfidenceStyles = () => {
    switch (confidence) {
      case 'HIGH':
        return 'bg-green-100 text-green-800';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800';
      case 'LOW':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getConfidenceStyles()}`}
    >
      {confidence}
    </span>
  );
};

