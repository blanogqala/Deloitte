/**
 * RequestSummary Component
 * 
 * Live-updating display of request state
 * Shows system, access level, project, status, confidence, and next action
 */

import React from 'react';
import { RequestState, TaskRequestStatus, AgentConfidence, User } from '../types/access';

interface RequestSummaryProps {
  requestState: RequestState | null;
  nextAction?: string;
  onResubmit?: () => void;
}

export const RequestSummary: React.FC<RequestSummaryProps> = ({ 
  requestState,
  nextAction,
  onResubmit,
  employees = []
}) => {
  if (!requestState) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-sm">No active request</p>
          <p className="text-xs mt-2">Start a request to see details</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: TaskRequestStatus) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800';
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-800';
      case 'AWAITING_APPROVAL':
        return 'bg-yellow-100 text-yellow-800';
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfidenceColor = (confidence: AgentConfidence) => {
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
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Request State
          </h2>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(requestState.status)}`}>
            {requestState.status}
          </span>
        </div>

        {/* Request Details */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              User
            </label>
            <p className="mt-1 text-sm text-gray-900">{requestState.user}</p>
            <p className="text-xs text-gray-500">{requestState.role}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              System {!requestState.system && <span className="text-blue-500">*</span>}
            </label>
            {requestState.system ? (
              <p className="mt-1 text-sm text-gray-900">{requestState.system}</p>
            ) : (
              <p className="mt-1 text-sm text-blue-600 italic">Awaiting input</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Access Level {!requestState.accessLevel && <span className="text-blue-500">*</span>}
            </label>
            {requestState.accessLevel ? (
              <p className="mt-1 text-sm text-gray-900">{requestState.accessLevel}</p>
            ) : (
              <p className="mt-1 text-sm text-blue-600 italic">Awaiting input</p>
            )}
          </div>

          {requestState.system === 'GitHub' && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Project {!requestState.project && <span className="text-blue-500">*</span>}
              </label>
              {requestState.project ? (
                <p className="mt-1 text-sm text-gray-900">{requestState.project}</p>
              ) : (
                <p className="mt-1 text-sm text-blue-600 italic">Awaiting input</p>
              )}
            </div>
          )}

          {(requestState.system === 'Email' || requestState.system === 'Jira') && requestState.role === 'Intern' && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Target Employee {!requestState.targetEmployeeId && <span className="text-blue-500">*</span>}
              </label>
              {requestState.targetEmployeeId ? (
                <p className="mt-1 text-sm text-gray-900">
                  {employees.find(e => e.id === requestState.targetEmployeeId)?.name || requestState.targetEmployeeId}
                </p>
              ) : (
                <p className="mt-1 text-sm text-blue-600 italic">Awaiting input</p>
              )}
            </div>
          )}

          {/* Request Owner / Approver Information */}
          {requestState.status === 'AWAITING_APPROVAL' && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Request Owner
              </label>
              {requestState.system === 'GitHub' && requestState.project ? (
                <p className="mt-1 text-sm text-gray-900">
                  Project Manager ({requestState.project})
                </p>
              ) : requestState.system === 'Email' && requestState.targetEmployeeId ? (
                <p className="mt-1 text-sm text-gray-900">
                  {employees.find(e => e.id === requestState.targetEmployeeId)?.name || 'Employee'}
                </p>
              ) : requestState.system === 'Jira' && requestState.targetEmployeeId ? (
                <p className="mt-1 text-sm text-gray-900">
                  {employees.find(e => e.id === requestState.targetEmployeeId)?.name || 'Employee'}
                </p>
              ) : (
                <p className="mt-1 text-sm text-gray-500 italic">To be determined</p>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Agent Confidence
            </label>
            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium mt-1 ${getConfidenceColor(requestState.agentConfidence)}`}>
              {requestState.agentConfidence}
            </span>
          </div>

          {requestState.missingFields.length > 0 && requestState.status !== 'REJECTED' && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Awaiting Input
              </label>
              <div className="mt-1">
                {requestState.missingFields.map((field, idx) => (
                  <span key={idx} className="inline-block bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2 py-1 rounded mr-1 mb-1">
                    {field}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-600 italic">
                Please provide the required information to continue.
              </p>
            </div>
          )}

          {/* Terminal State: APPROVED */}
          {requestState.status === 'APPROVED' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-sm font-semibold text-green-800">Access Granted</h3>
              </div>
              {requestState.accessLink && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Access Link:
                  </label>
                  <a
                    href={requestState.accessLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 underline break-all"
                  >
                    {requestState.accessLink}
                  </a>
                </div>
              )}
              {requestState.approverRole && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Approved by:
                  </label>
                  <p className="text-sm text-gray-900">
                    {requestState.approverRole}{requestState.approverId ? ` (${requestState.approverId})` : ''}
                  </p>
                </div>
              )}
              {requestState.approvedAt && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Approved at:
                  </label>
                  <p className="text-sm text-gray-900">
                    {new Date(requestState.approvedAt).toLocaleString()}
                  </p>
                </div>
              )}
              <p className="text-xs text-gray-600">
                Your request has been approved. You can now access the requested resource.
              </p>
            </div>
          )}

          {/* Terminal State: REJECTED */}
          {requestState.status === 'REJECTED' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-sm font-semibold text-red-800">Request Rejected</h3>
              </div>
              {requestState.rejectionReason && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Rejection Reason:
                  </label>
                  <p className="text-sm text-gray-900 bg-white border border-gray-200 rounded p-2">
                    {requestState.rejectionReason}
                  </p>
                </div>
              )}
              {requestState.approverRole && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Rejected by:
                  </label>
                  <p className="text-sm text-gray-900">
                    {requestState.approverRole}{requestState.approverId ? ` (${requestState.approverId})` : ''}
                  </p>
                </div>
              )}
              {requestState.rejectedAt && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Rejected at:
                  </label>
                  <p className="text-sm text-gray-900">
                    {new Date(requestState.rejectedAt).toLocaleString()}
                  </p>
                </div>
              )}
              {onResubmit && (
                <button
                  onClick={onResubmit}
                  className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Resubmit Request
                </button>
              )}
            </div>
          )}

          {/* Show Next Action only if not in terminal state */}
          {nextAction && requestState.status !== 'APPROVED' && requestState.status !== 'REJECTED' && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Next Action
              </label>
              <p className="mt-1 text-sm text-blue-600 font-medium">{nextAction}</p>
            </div>
          )}

          {requestState.missingFields.length === 0 && requestState.status === 'IN_PROGRESS' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800 font-medium">
                ✓ All required fields complete. Request will be submitted automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
