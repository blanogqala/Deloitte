/**
 * Approval Service
 * 
 * Manages approval workflows for access requests.
 * Tracks request status and determines approval authorities.
 * 
 * Security Principle: Approval workflow is enforced at the service layer.
 * Only authorized roles (Manager, IT Administrator) can approve requests.
 */

import { 
  AccessRequest, 
  RequestStatus, 
  UserRole 
} from '../models/AccessRequest';
import { canApproveRequests, hasFinalApprovalAuthority } from './ruleEngine.service';
import { 
  emitApprovalEvent, 
  emitRejectionEvent, 
  generateAccessLink,
  ApprovalEvent 
} from './approvalEvent.service';

// In-memory store for access requests
// In production, this would be a database
const accessRequests: Map<string, AccessRequest> = new Map();

/**
 * Creates a new access request and stores it
 * 
 * @param request - The access request to create
 * @returns The created request with generated ID
 */
export function createAccessRequest(request: Omit<AccessRequest, 'id' | 'createdAt' | 'updatedAt'>): AccessRequest {
  const id = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  
  const accessRequest: AccessRequest = {
    ...request,
    id,
    createdAt: now,
    updatedAt: now
  };

  accessRequests.set(id, accessRequest);
  return accessRequest;
}

/**
 * Retrieves an access request by ID
 * 
 * @param requestId - The ID of the request
 * @returns The access request or undefined if not found
 */
export function getAccessRequest(requestId: string): AccessRequest | undefined {
  return accessRequests.get(requestId);
}

/**
 * Determines who should approve a request based on the request details
 * 
 * @param request - The access request
 * @returns The role that should approve, or null if no approval needed
 */
export function determineApprover(request: AccessRequest): UserRole | null {
  if (!request.requiresApproval) {
    return null;
  }

  // IT Administrator has final approval authority
  // Manager can approve most requests, but IT Admin approval may be required for sensitive access
  if (request.accessLevel === 'admin' && request.userRole !== 'IT Administrator') {
    return 'IT Administrator';
  }

  // Manager can approve requests from Interns and Developers
  if (request.userRole === 'Intern' || request.userRole === 'Developer') {
    return 'Manager';
  }

  // Default to Manager for other cases
  return 'Manager';
}

/**
 * Approves an access request
 * 
 * @param requestId - The ID of the request to approve
 * @param approverRole - The role of the person approving
 * @param approverId - The ID of the approver (for event generation)
 * @returns Object with updated request and approval event, or null if not found/invalid
 */
export function approveRequest(
  requestId: string, 
  approverRole: UserRole,
  approverId?: string
): { request: AccessRequest; event: ApprovalEvent } | null {
  const request = accessRequests.get(requestId);
  
  if (!request) {
    return null;
  }

  // Check if the approver has permission to approve
  // Allow employees to approve their own account access requests (employee-owned requests)
  const isEmployeeOwnedRequest = request.employeeOwnerId && request.employeeOwnerId === approverId;
  if (!canApproveRequests(approverRole) && !isEmployeeOwnedRequest) {
    throw new Error(`Role ${approverRole} does not have permission to approve requests`);
  }

  // Check if request is in a state that can be approved
  if (request.status !== 'pending') {
    throw new Error(`Request ${requestId} is not in pending status and cannot be approved`);
  }

  // Generate access link before updating status
  const accessLink = generateAccessLink(
    request.system,
    request.accessLevel,
    request.project,
    request.userId,
    request.targetEmployeeId
  );

  // Generate timestamp
  const approvedAt = new Date().toISOString();

  // Update request status and store approval metadata
  request.status = 'approved';
  request.approvalBy = approverRole;
  if (approverId) {
    request.approverId = approverId;
  }
  request.approverRole = approverRole;
  request.approvedAt = approvedAt;
  request.updatedAt = approvedAt;

  accessRequests.set(requestId, request);

  // Emit approval event (requires approverId)
  if (approverId) {
    const event = emitApprovalEvent(request, approverId, approverRole, accessLink, approvedAt);
    return { request, event };
  }

  // Fallback if approverId not provided (shouldn't happen in normal flow)
  return { request, event: emitApprovalEvent(request, 'unknown', approverRole, accessLink, approvedAt) };
}

/**
 * Rejects an access request
 * 
 * @param requestId - The ID of the request to reject
 * @param approverRole - The role of the person rejecting
 * @param reason - Reason for rejection (≤120 chars)
 * @param approverId - The ID of the approver (for event generation)
 * @returns Object with updated request and rejection event, or null if not found/invalid
 */
export function rejectRequest(
  requestId: string, 
  approverRole: UserRole, 
  reason: string,
  approverId?: string
): { request: AccessRequest; event: ApprovalEvent } | null {
  const request = accessRequests.get(requestId);
  
  if (!request) {
    return null;
  }

  // Validate rejection reason length
  if (reason.length > 120) {
    throw new Error('Rejection reason must be 120 characters or less');
  }

  // Check if the approver has permission
  // Allow employees to reject their own account access requests (employee-owned requests)
  const isEmployeeOwnedRequest = request.employeeOwnerId && request.employeeOwnerId === approverId;
  if (!canApproveRequests(approverRole) && !isEmployeeOwnedRequest) {
    throw new Error(`Role ${approverRole} does not have permission to reject requests`);
  }

  // Check if request is in a state that can be rejected
  if (request.status !== 'pending') {
    throw new Error(`Request ${requestId} is not in pending status and cannot be rejected`);
  }

  // Generate timestamp
  const rejectedAt = new Date().toISOString();

  // Update request status and store rejection metadata
  request.status = 'rejected';
  request.approvalBy = approverRole;
  request.rejectionReason = reason;
  if (approverId) {
    request.approverId = approverId;
  }
  request.approverRole = approverRole;
  request.rejectedAt = rejectedAt;
  request.updatedAt = rejectedAt;

  accessRequests.set(requestId, request);

  // Emit rejection event (requires approverId)
  if (approverId) {
    const event = emitRejectionEvent(request, approverId, approverRole, reason, rejectedAt);
    return { request, event };
  }

  // Fallback if approverId not provided (shouldn't happen in normal flow)
  return { request, event: emitRejectionEvent(request, 'unknown', approverRole, reason, rejectedAt) };
}

/**
 * Gets all access requests (for admin purposes)
 * 
 * @returns Array of all access requests
 */
export function getAllAccessRequests(): AccessRequest[] {
  return Array.from(accessRequests.values());
}

/**
 * Gets access requests for a specific user
 * 
 * @param userId - The ID of the user
 * @returns Array of access requests for the user
 */
export function getUserAccessRequests(userId: string): AccessRequest[] {
  return Array.from(accessRequests.values()).filter(req => req.userId === userId);
}

/**
 * Gets pending approvals for a manager or employee
 * Returns requests that need approval from the specified user
 * Filters STRICTLY by assignedApproverId (unified primary approver)
 * 
 * @param managerId - The ID of the manager/employee (can be any user ID)
 * @param managerRole - The role of the manager (for IT Admin check)
 * @param managedProjectIds - Deprecated, kept for backward compatibility
 * @returns Array of pending access requests requiring approval
 */
export function getPendingApprovalsForManager(
  managerId: string,
  managerRole: UserRole,
  managedProjectIds: string[] // Deprecated, kept for compatibility but not used
): AccessRequest[] {
  // Check if user can approve requests
  // Note: For employee-owned requests, any employee can approve their own account access
  // So we allow all users to see their own employee-owned requests
  if (!canApproveRequests(managerRole) && managerRole !== 'Developer' && managerRole !== 'Intern') {
    return [];
  }

  // Get all pending requests
  const allRequests = Array.from(accessRequests.values());
  const pendingRequests = allRequests.filter(req => req.status === 'pending' && req.requiresApproval);

  // Filter requests that need approval from this user
  return pendingRequests.filter(request => {
    // IT Administrators can see all requests (override authority)
    if (managerId === 'admin-001' || managerRole === 'IT Administrator') {
      return true;
    }

    // All other users ONLY see requests where assignedApproverId matches their ID
    // This ensures Manager Alpha ONLY sees Project Alpha requests, Manager Beta ONLY sees Project Beta requests
    if (request.assignedApproverId === managerId) {
      return true;
    }

    // If request has no assignedApproverId, don't show it to regular users
    // (IT Admin can still see it via the check above)
    return false;
  });
}

/**
 * Gets count of pending approvals for a manager
 * 
 * @param managerId - The ID of the manager
 * @param managerRole - The role of the manager
 * @param managedProjectIds - Array of project IDs the manager manages
 * @returns Count of pending approvals
 */
export function getPendingApprovalsCount(
  managerId: string,
  managerRole: UserRole,
  managedProjectIds: string[]
): number {
  return getPendingApprovalsForManager(managerId, managerRole, managedProjectIds).length;
}

