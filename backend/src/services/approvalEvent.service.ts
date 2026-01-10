/**
 * Approval Event Service
 * 
 * Handles approval/rejection events and generates access links
 * Emits events that trigger chat message additions
 */

import { AccessRequest, SystemName, AccessLevel, UserRole } from '../models/AccessRequest';

export interface ApprovalEvent {
  type: 'approval' | 'rejection';
  requestId: string;
  managerId: string; // ID of the approver
  internId: string;
  managerMessage: string;
  internMessage: string;
  projectOwnerManagerId?: string; // Deprecated, kept for backward compatibility
  projectOwnerMessage?: string; // Deprecated, kept for backward compatibility
  originalResourceOwnerId?: string; // ID of the original resource owner (assignedApproverId) - notified when IT Admin approves
  originalResourceOwnerMessage?: string; // Message for original resource owner (if IT Admin approved)
  approverRole: UserRole; // Role of the approver
  approvedAt?: string; // ISO timestamp when approved
  rejectedAt?: string; // ISO timestamp when rejected
  accessLink?: string; // Only for approvals
  rejectionReason?: string; // Only for rejections
}

/**
 * Generates a mock access link based on system type
 * 
 * @param system - The system for which access is granted
 * @param accessLevel - The access level
 * @param project - Optional project name
 * @param userId - User ID for email links (requester)
 * @param targetEmployeeId - Optional target employee ID for employee-owned requests
 * @returns Mock URL string
 */
export function generateAccessLink(
  system: SystemName,
  accessLevel: AccessLevel,
  project?: string,
  userId?: string,
  targetEmployeeId?: string
): string {
  switch (system) {
    case 'GitHub':
      if (project) {
        const projectSlug = project === 'Project Alpha' 
          ? 'project-alpha' 
          : project === 'Project Beta' 
          ? 'project-beta' 
          : 'main';
        return `https://github.com/company/${projectSlug}`;
      }
      return 'https://github.com/company';
      
    case 'Jira':
      if (project) {
        const projectKey = project === 'Project Alpha' 
          ? 'ALPHA' 
          : project === 'Project Beta' 
          ? 'BETA' 
          : 'MAIN';
        return `https://company.atlassian.net/projects/${projectKey}`;
      }
      // For employee-owned Jira requests, use target employee's account
      if (targetEmployeeId) {
        return `https://company.atlassian.net/people/${targetEmployeeId}`;
      }
      return 'https://company.atlassian.net';
      
    case 'Email':
      // For employee-owned Email requests, use target employee's email
      const emailUserId = targetEmployeeId || userId;
      const email = emailUserId ? `${emailUserId}@company.com` : 'access@company.com';
      return `mailto:${email}`;
      
    default:
      return `https://company.com/access/${system.toLowerCase()}`;
  }
}

/**
 * Emits an approval event
 * Generates messages for approver, intern, and project-owning manager (if IT Admin approved)
 * 
 * @param request - The approved access request
 * @param approverId - The ID of the approver
 * @param approverRole - The role of the approver
 * @param accessLink - The generated access link
 * @param approvedAt - ISO timestamp when approved
 * @returns ApprovalEvent with messages for all relevant users
 */
export function emitApprovalEvent(
  request: AccessRequest,
  approverId: string,
  approverRole: UserRole,
  accessLink: string,
  approvedAt: string
): ApprovalEvent {
  const users = require('../data/users.json');
  const targetEmployee = request.targetEmployeeId ? users.find((u: any) => u.id === request.targetEmployeeId) : null;
  
  // Determine message based on request type (project-based vs employee-owned)
  let managerMessage: string;
  let internMessage: string;
  
  if (request.employeeOwnerId && request.targetEmployeeId) {
    // Employee-owned request
    const targetEmployeeName = targetEmployee?.name || 'employee';
    managerMessage = `Approved request from ${request.userName} (${request.userRole}) for ${request.system} ${request.accessLevel} access to your account`;
    internMessage = `Your request for ${request.system} ${request.accessLevel} access to ${targetEmployeeName}'s account has been approved. Access link: ${accessLink}`;
  } else {
    // Project-based request
    managerMessage = `Approved request from ${request.userName} (${request.userRole}) for ${request.system} ${request.accessLevel} access${request.project ? ` to ${request.project}` : ''}`;
    internMessage = `Your request for ${request.system} ${request.accessLevel} access${request.project ? ` to ${request.project}` : ''} has been approved. Access link: ${accessLink}`;
  }

  // Handle IT Admin override notifications
  let originalResourceOwnerId: string | undefined = undefined;
  let originalResourceOwnerMessage: string | undefined = undefined;
  let projectOwnerMessage: string | undefined = undefined; // Kept for backward compatibility

  // When IT Admin approves, notify the original resource owner (assignedApproverId)
  if (approverRole === 'IT Administrator' && request.assignedApproverId && request.assignedApproverId !== approverId) {
    originalResourceOwnerId = request.assignedApproverId;
    
    // Generate appropriate message based on request type
    if (request.project) {
      originalResourceOwnerMessage = `IT Admin approved access for ${request.userName} to ${request.project}`;
      projectOwnerMessage = originalResourceOwnerMessage; // Backward compatibility
    } else if (request.targetEmployeeId && targetEmployee) {
      originalResourceOwnerMessage = `IT Admin approved access for ${request.userName} to ${targetEmployee.name}'s ${request.system} account`;
    } else {
      originalResourceOwnerMessage = `IT Admin approved access for ${request.userName} to ${request.system}`;
    }
  }

  return {
    type: 'approval',
    requestId: request.id,
    managerId: approverId,
    internId: request.userId,
    managerMessage,
    internMessage,
    projectOwnerManagerId: approverRole === 'IT Administrator' ? request.projectOwnerManagerId : undefined, // Backward compatibility
    projectOwnerMessage, // Backward compatibility
    originalResourceOwnerId,
    originalResourceOwnerMessage,
    approverRole,
    approvedAt,
    accessLink
  };
}

/**
 * Emits a rejection event
 * Generates messages for approver and intern
 * 
 * @param request - The rejected access request
 * @param approverId - The ID of the approver
 * @param approverRole - The role of the approver
 * @param reason - Rejection reason (≤120 chars)
 * @param rejectedAt - ISO timestamp when rejected
 * @returns RejectionEvent with messages for both users
 */
export function emitRejectionEvent(
  request: AccessRequest,
  approverId: string,
  approverRole: UserRole,
  reason: string,
  rejectedAt: string
): ApprovalEvent {
  const users = require('../data/users.json');
  const targetEmployee = request.targetEmployeeId ? users.find((u: any) => u.id === request.targetEmployeeId) : null;
  
  // Determine message based on request type (project-based vs employee-owned)
  let managerMessage: string;
  let internMessage: string;
  
  if (request.employeeOwnerId && request.targetEmployeeId) {
    // Employee-owned request
    const targetEmployeeName = targetEmployee?.name || 'employee';
    managerMessage = `Rejected request from ${request.userName} (${request.userRole}) for ${request.system} ${request.accessLevel} access to your account. Reason: ${reason}`;
    internMessage = `Your request for ${request.system} ${request.accessLevel} access to ${targetEmployeeName}'s account has been rejected. Reason: ${reason}`;
  } else {
    // Project-based request
    managerMessage = `Rejected request from ${request.userName} (${request.userRole}) for ${request.system} ${request.accessLevel} access${request.project ? ` to ${request.project}` : ''}. Reason: ${reason}`;
    internMessage = `Your request for ${request.system} ${request.accessLevel} access${request.project ? ` to ${request.project}` : ''} has been rejected. Reason: ${reason}`;
  }

  return {
    type: 'rejection',
    requestId: request.id,
    managerId: approverId,
    internId: request.userId,
    managerMessage,
    internMessage,
    approverRole,
    rejectedAt,
    rejectionReason: reason
  };
}

