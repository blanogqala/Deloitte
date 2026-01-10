/**
 * Escalation Service
 * 
 * Manages escalation workflows for access requests when users
 * request access to projects they are not assigned to.
 * 
 * Security Principle: Escalation requires explicit user confirmation
 * and routes to the correct project manager.
 */

import { 
  EscalationRequest, 
  SystemName, 
  AccessLevel, 
  RequestStatus 
} from '../models/AccessRequest';

// In-memory store for escalation requests
// In production, this would be a database
const escalationRequests: Map<string, EscalationRequest> = new Map();

/**
 * Creates a new escalation request
 * 
 * @param userId - The ID of the user requesting escalation
 * @param projectId - The ID of the project
 * @param system - The system for which access is requested
 * @param accessLevel - The access level being requested
 * @param escalationTo - The manager ID to escalate to
 * @returns The created escalation request
 */
export function createEscalationRequest(
  userId: string,
  projectId: string,
  system: SystemName,
  accessLevel: AccessLevel,
  escalationTo: string
): EscalationRequest {
  const id = `escalation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  
  const escalationRequest: EscalationRequest = {
    id,
    userId,
    projectId,
    system,
    accessLevel,
    status: 'pending',
    escalationTo,
    createdAt: now,
    updatedAt: now
  };

  escalationRequests.set(id, escalationRequest);
  
  // Automatically process manager decision after a short delay (simulated)
  // In production, this would be handled by the manager through a UI
  setTimeout(() => {
    processManagerDecision(id, escalationTo);
  }, 2000); // 2 second delay for demo purposes

  return escalationRequest;
}

/**
 * Processes a manager's decision on an escalation request
 * 
 * Mock implementation: Automatically approves/rejects based on simple rules
 * In production, this would be called by the manager through a UI
 * 
 * @param requestId - The ID of the escalation request
 * @param managerId - The ID of the manager making the decision
 * @returns The updated escalation request
 */
function processManagerDecision(
  requestId: string,
  managerId: string
): EscalationRequest | null {
  const request = escalationRequests.get(requestId);
  
  if (!request || request.escalationTo !== managerId) {
    return null;
  }

  // Mock decision logic: Approve 70% of requests, reject 30%
  // In production, this would be a real manager decision
  const approved = Math.random() > 0.3;
  
  const justifications = {
    approved: [
      "Access approved for project collaboration.",
      "User needs access to complete assigned tasks.",
      "Approved based on project requirements.",
      "Access granted for cross-team collaboration."
    ],
    rejected: [
      "User not currently assigned to this project.",
      "Access not required for current project scope.",
      "Request does not align with project needs.",
      "Insufficient justification for access."
    ]
  };

  const justificationList = approved ? justifications.approved : justifications.rejected;
  const justification = justificationList[
    Math.floor(Math.random() * justificationList.length)
  ];

  request.status = approved ? 'approved' : 'rejected';
  request.justification = justification;
  request.updatedAt = new Date().toISOString();

  escalationRequests.set(requestId, request);
  return request;
}

/**
 * Manually process a manager decision (for testing/demo purposes)
 * 
 * @param requestId - The ID of the escalation request
 * @param approved - Whether the request is approved
 * @param justification - Justification for the decision (≤120 chars)
 * @returns The updated escalation request
 */
export function processManagerDecisionManually(
  requestId: string,
  approved: boolean,
  justification: string
): EscalationRequest | null {
  const request = escalationRequests.get(requestId);
  
  if (!request) {
    return null;
  }

  if (justification.length > 120) {
    throw new Error('Justification must be 120 characters or less');
  }

  request.status = approved ? 'approved' : 'rejected';
  request.justification = justification;
  request.updatedAt = new Date().toISOString();

  escalationRequests.set(requestId, request);
  return request;
}

/**
 * Retrieves an escalation request by ID
 * 
 * @param requestId - The ID of the escalation request
 * @returns The escalation request or undefined if not found
 */
export function getEscalationRequest(requestId: string): EscalationRequest | undefined {
  return escalationRequests.get(requestId);
}

/**
 * Gets all pending escalation requests for a manager
 * 
 * @param managerId - The ID of the manager
 * @returns Array of pending escalation requests
 */
export function getPendingEscalations(managerId: string): EscalationRequest[] {
  return Array.from(escalationRequests.values())
    .filter(req => req.escalationTo === managerId && req.status === 'pending');
}

/**
 * Gets all escalation requests for a user
 * 
 * @param userId - The ID of the user
 * @returns Array of escalation requests for the user
 */
export function getUserEscalations(userId: string): EscalationRequest[] {
  return Array.from(escalationRequests.values())
    .filter(req => req.userId === userId);
}

