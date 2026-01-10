/**
 * ApprovalStatus Component
 * 
 * Displays status badges for access requests
 */

import React from 'react';
import { RequestStatus } from '../types/access';

interface ApprovalStatusProps {
  status: RequestStatus;
  requiresApproval?: boolean;
}

export const ApprovalStatus: React.FC<ApprovalStatusProps> = ({ 
  status, 
  requiresApproval 
}) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = () => {
    if (status === 'pending' && requiresApproval) {
      return 'Pending Approval';
    }
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusStyles()}`}
    >
      {getStatusText()}
    </span>
  );
};

