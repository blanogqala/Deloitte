/**
 * State Transition Service
 * 
 * Handles state transitions, auto-submission, and recovery logic
 * for the task-driven agent.
 */

import { 
  RequestState, 
  TaskRequestStatus,
  SystemName,
  AccessLevel 
} from '../models/AccessRequest';
import { 
  validateStateTransition, 
  shouldAutoSubmit,
  updateRequestState 
} from './requestState.service';
import { createAccessRequest, determineApprover } from './approval.service';
import { validateAccessRequest } from './ruleEngine.service';
import { generateAccessLink } from './approvalEvent.service';
import projectsData from '../data/projects.json';
import usersData from '../data/users.json';

/**
 * Transitions state to AWAITING_APPROVAL or APPROVED when all fields are complete
 * Auto-approves if requiresApproval is false, otherwise transitions to AWAITING_APPROVAL
 * 
 * @param state - Current request state
 * @returns Updated state with AWAITING_APPROVAL or APPROVED status
 */
export function transitionToAwaitingApproval(state: RequestState): RequestState {
  // Validate transition - can go to either AWAITING_APPROVAL or APPROVED from IN_PROGRESS
  if (state.status !== 'IN_PROGRESS') {
    throw new Error(`Invalid transition from ${state.status} to AWAITING_APPROVAL/APPROVED`);
  }

  if (!shouldAutoSubmit(state)) {
    throw new Error('Cannot transition to AWAITING_APPROVAL: missing required fields');
  }

  // Validate against RBAC rules
  const validationResult = validateAccessRequest(
    state.user,
    state.role,
    state.system!,
    state.accessLevel!,
    state.project === 'Project Alpha' ? 'project-1' : state.project === 'Project Beta' ? 'project-2' : undefined
  );

  // If validation fails, throw error to prevent auto-submission
  // Only explicit user rejections (via approval modal) should set REJECTED status
  if (!validationResult.isValid) {
    throw new Error(`Access request validation failed: ${validationResult.rejectionReason || 'Invalid request'}`);
  }

  // Determine projectId and projectOwnerManagerId (for GitHub/project-based requests)
  const projectId = state.project === 'Project Alpha' ? 'project-1' : state.project === 'Project Beta' ? 'project-2' : undefined;
  let projectOwnerManagerId: string | undefined = undefined;

  // Find the managerId for the project if projectId exists
  if (projectId) {
    const project = (projectsData as any[]).find((p: any) => p.id === projectId);
    if (project && project.managerId) {
      projectOwnerManagerId = project.managerId;
    }
  }

  // Determine employeeOwnerId (for Email/Jira employee-owned requests)
  let employeeOwnerId: string | undefined = undefined;
  if ((state.system === 'Email' || state.system === 'Jira') && state.targetEmployeeId) {
    employeeOwnerId = state.targetEmployeeId;
  }

  // Determine assignedApproverId (unified primary approver)
  // For GitHub requests: use projectOwnerManagerId
  // For Email/Jira employee-owned: use employeeOwnerId
  let assignedApproverId: string | undefined = undefined;
  if (projectOwnerManagerId) {
    assignedApproverId = projectOwnerManagerId;
  } else if (employeeOwnerId) {
    assignedApproverId = employeeOwnerId;
  }

  // CRITICAL: Employee-owned requests (Email/Jira with targetEmployeeId) MUST require approval
  // Even if RBAC rules say otherwise, the employee owner must approve access to their account
  const isEmployeeOwnedRequest = employeeOwnerId !== undefined;
  const finalRequiresApproval = isEmployeeOwnedRequest ? true : validationResult.requiresApproval;

  // Set fallbackApproverId to IT Admin for all requests requiring approval
  const fallbackApproverId = finalRequiresApproval ? 'admin-001' : undefined;

  // Look up user name from user data
  const user = (usersData as any[]).find((u: any) => u.id === state.user);
  const userName = user?.name || state.user;

  // Create access request
  const accessRequest = createAccessRequest({
    userId: state.user,
    userName: userName,
    userRole: state.role,
    system: state.system!,
    accessLevel: state.accessLevel!,
    project: state.project,
    projectId: projectId,
    projectOwnerManagerId: projectOwnerManagerId,
    targetEmployeeId: state.targetEmployeeId,
    employeeOwnerId: employeeOwnerId,
    assignedApproverId: assignedApproverId,
    fallbackApproverId: fallbackApproverId,
    status: finalRequiresApproval ? 'pending' : 'approved',
    requiresApproval: finalRequiresApproval
  });

  // If approval is not required, auto-approve and generate access link
  if (!finalRequiresApproval) {
    // Generate access link for auto-approved request
    const accessLink = generateAccessLink(
      state.system!,
      state.accessLevel!,
      state.project,
      state.user,
      state.targetEmployeeId
    );
    
    const approvedAt = new Date().toISOString();
    
    // Update state to APPROVED with access link and timestamp
    return updateRequestState(state, {
      status: 'APPROVED',
      accessLink: accessLink,
      approvedAt: approvedAt,
      approverId: state.user, // Self-approved
      approverRole: state.role
    });
  }

  // Update state to AWAITING_APPROVAL (requires approval)
  return updateRequestState(state, {
    status: 'AWAITING_APPROVAL'
  });
}

/**
 * Handles rejection scenario
 * 
 * @param state - Current request state
 * @param reason - Rejection reason
 * @returns Updated state with REJECTED status
 */
export function handleRejection(state: RequestState, reason: string): RequestState {
  if (!validateStateTransition(state.status, 'REJECTED')) {
    throw new Error(`Invalid transition from ${state.status} to REJECTED`);
  }

  return updateRequestState(state, {
    status: 'REJECTED'
  });
}

/**
 * Handles recovery from rejection or low confidence
 * Allows user to correct and proceed
 * 
 * @param state - Current request state
 * @param correction - Correction data (e.g., downgraded access level)
 * @returns Updated state with recovery applied
 */
export function handleRecovery(
  state: RequestState, 
  correction: { accessLevel?: AccessLevel; system?: SystemName }
): RequestState {
  // Reset to IN_PROGRESS to allow corrections
  const recoveredState = updateRequestState(state, {
    status: 'IN_PROGRESS',
    ...correction
  });

  return recoveredState;
}

/**
 * Checks if state can transition to a target status
 * 
 * @param fromStatus - Current status
 * @param toStatus - Target status
 * @returns True if transition is valid
 */
export function canTransition(
  fromStatus: TaskRequestStatus,
  toStatus: TaskRequestStatus
): boolean {
  return validateStateTransition(fromStatus, toStatus);
}

/**
 * Processes state update and handles automatic transitions
 * 
 * @param state - Current state
 * @param updates - Updates to apply
 * @returns Updated state with automatic transitions applied
 */
export function processStateUpdate(
  state: RequestState,
  updates: Partial<RequestState>
): RequestState {
  // Apply updates
  let updatedState = updateRequestState(state, updates);

  // Check if ready for auto-submission
  if (updatedState.status === 'IN_PROGRESS' && shouldAutoSubmit(updatedState)) {
    try {
      updatedState = transitionToAwaitingApproval(updatedState);
    } catch (error) {
      // If transition fails (e.g., validation), state remains IN_PROGRESS
      console.error('Auto-submission failed:', error);
    }
  }

  return updatedState;
}

