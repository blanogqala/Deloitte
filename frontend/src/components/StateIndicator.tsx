/**
 * StateIndicator Component
 * 
 * Displays request status badge
 */

import React from 'react';
import { TaskRequestStatus } from '../types/access';

interface StateIndicatorProps {
  status: TaskRequestStatus;
}

export const StateIndicator: React.FC<StateIndicatorProps> = ({ status }) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'AWAITING_APPROVAL':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'APPROVED':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'REJECTED':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusStyles()}`}
    >
      {status}
    </span>
  );
};

