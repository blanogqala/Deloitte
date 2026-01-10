/**
 * ApprovalModal Component
 * 
 * Modal dialog for managers to approve or reject pending access requests
 * Shows requester details, system, access level, and project information
 */

import React, { useState } from 'react';
import { AccessRequest, ChatMessage, User } from '../types/access';
import { approveRequest, rejectRequest } from '../services/api';

interface ApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingApprovals: AccessRequest[];
  approverId: string;
  onApprovalUpdate: () => void;
  onAddChatMessage: (userId: string, message: string, sender?: 'user' | 'assistant' | 'system') => void;
  employees?: User[]; // Optional list of employees to resolve targetEmployeeId to name
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  isOpen,
  onClose,
  pendingApprovals,
  approverId,
  onApprovalUpdate,
  onAddChatMessage,
  employees = []
}) => {
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApprove = async (requestId: string) => {
    try {
      setProcessing(requestId);
      const response = await approveRequest(requestId, approverId);
      
      // Handle approval event - add messages to approver, intern, and original resource owner (if IT Admin approved)
      if (response.event) {
        // Add approval log message to approver's chat
        onAddChatMessage(response.event.managerId, response.event.managerMessage, 'system');
        
        // Add notification message to intern's chat (with access link if available)
        const internMessage = response.event.accessLink 
          ? `${response.event.internMessage}`
          : response.event.internMessage;
        onAddChatMessage(response.event.internId, internMessage, 'assistant');
        
        // If IT Admin approved and original resource owner exists, notify them
        // Use new fields (originalResourceOwnerId/originalResourceOwnerMessage) if available,
        // fall back to deprecated fields for backward compatibility
        const resourceOwnerId = response.event.originalResourceOwnerId || response.event.projectOwnerManagerId;
        const resourceOwnerMessage = response.event.originalResourceOwnerMessage || response.event.projectOwnerMessage;
        
        if (response.event.approverRole === 'IT Administrator' && 
            resourceOwnerId && 
            resourceOwnerMessage &&
            resourceOwnerId !== response.event.managerId) {
          onAddChatMessage(resourceOwnerId, resourceOwnerMessage, 'system');
        }
      }
      
      onApprovalUpdate();
      // Remove the approved request from local state
      setRejectReasons(prev => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
    } catch (error) {
      console.error('Failed to approve request:', error);
      alert('Failed to approve request. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (requestId: string) => {
    const reason = rejectReasons[requestId]?.trim();
    if (!reason) {
      alert('Please provide a reason for rejection');
      return;
    }

    if (reason.length > 120) {
      alert('Rejection reason must be 120 characters or less');
      return;
    }

    try {
      setProcessing(requestId);
      const response = await rejectRequest(requestId, approverId, reason);
      
      // Handle rejection event - add messages to approver and intern
      // Note: Project-owning manager does NOT receive notification for rejections (only for IT Admin approvals)
      if (response.event) {
        // Add rejection log message to approver's chat
        onAddChatMessage(response.event.managerId, response.event.managerMessage, 'system');
        
        // Add rejection notification message to intern's chat
        onAddChatMessage(response.event.internId, response.event.internMessage, 'assistant');
      }
      
      onApprovalUpdate();
      // Remove the rejected request from local state
      setRejectReasons(prev => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
    } catch (error) {
      console.error('Failed to reject request:', error);
      alert('Failed to reject request. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            Pending Approvals ({pendingApprovals.length})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {pendingApprovals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No pending approvals</p>
            </div>
          ) : (
            <div className="space-y-6">
              {pendingApprovals.map((request) => (
                <div
                  key={request.id}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  {/* Request Details */}
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">
                        Request from {request.userName}
                      </h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-500">Role:</span>{' '}
                          <span className="font-medium">{request.userRole}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">System:</span>{' '}
                          <span className="font-medium">{request.system}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Access Level:</span>{' '}
                          <span className="font-medium">{request.accessLevel}</span>
                        </div>
                        {request.project && (
                          <div>
                            <span className="text-gray-500">Project:</span>{' '}
                            <span className="font-medium">{request.project}</span>
                          </div>
                        )}
                        {request.targetEmployeeId && (
                          <div className="col-span-2">
                            <span className="text-gray-500">Requesting access to:</span>{' '}
                            <span className="font-medium">
                              {employees.find(e => e.id === request.targetEmployeeId)?.name || request.targetEmployeeId}
                            </span>
                            {' '}
                            <span className="text-xs text-gray-400">(your account)</span>
                          </div>
                        )}
                      </div>
                      {request.reason && (
                        <div className="mt-2 text-sm">
                          <span className="text-gray-500">Reason:</span>{' '}
                          <span className="text-gray-700">{request.reason}</span>
                        </div>
                      )}
                      <div className="mt-2 text-xs text-gray-400">
                        Requested: {new Date(request.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {/* Rejection Reason Input */}
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Rejection Reason (required if rejecting, max 120 chars):
                      </label>
                      <textarea
                        value={rejectReasons[request.id] || ''}
                        onChange={(e) =>
                          setRejectReasons(prev => ({
                            ...prev,
                            [request.id]: e.target.value
                          }))
                        }
                        placeholder="Enter reason for rejection..."
                        maxLength={120}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                        disabled={processing === request.id}
                      />
                      <div className="text-xs text-gray-400 mt-1">
                        {(rejectReasons[request.id]?.length || 0)}/120 characters
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={() => handleApprove(request.id)}
                        disabled={processing === request.id}
                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        {processing === request.id ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleReject(request.id)}
                        disabled={processing === request.id || !rejectReasons[request.id]?.trim()}
                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        {processing === request.id ? 'Processing...' : 'Reject'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

