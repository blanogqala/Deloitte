/**
 * Request State Service
 * 
 * Manages the task-driven agent's request state as single source of truth.
 * Handles state initialization, updates, validation, and transitions.
 */

import { 
  RequestState, 
  UserRole, 
  SystemName, 
  AccessLevel, 
  TaskRequestStatus,
  AgentConfidence 
} from '../models/AccessRequest';

// In-memory store for request states (per user)
// In production, this would be a database
const requestStates: Map<string, RequestState> = new Map();

/**
 * Creates a fresh initial request state
 * Never mutates existing state, always returns new object
 * 
 * @param userId - The ID of the user
 * @param role - The role of the user
 * @returns New RequestState in DRAFT status
 */
export function createInitialRequestState(userId: string, role: UserRole): RequestState {
  return {
    user: userId,
    role,
    system: undefined,
    accessLevel: undefined,
    project: undefined,
    status: 'DRAFT',
    agentConfidence: 'MEDIUM',
    missingFields: ['system', 'accessLevel']
  };
}

/**
 * Initializes a new request state for a user
 * 
 * @param userId - The ID of the user
 * @param role - The role of the user
 * @returns New RequestState in DRAFT status
 */
export function initializeRequestState(userId: string, role: UserRole): RequestState {
  const state = createInitialRequestState(userId, role);
  requestStates.set(userId, state);
  return state;
}

/**
 * Gets the current request state for a user
 * 
 * @param userId - The ID of the user
 * @returns Current RequestState or null if not found
 */
export function getRequestState(userId: string): RequestState | null {
  return requestStates.get(userId) || null;
}

/**
 * Validates request state deterministically
 * Returns validation result with missing fields and next action
 * 
 * @param state - The current request state
 * @returns Validation result with isValid, missingFields, and nextAction
 */
export function validateRequestState(state: RequestState): {
  isValid: boolean;
  missingFields: string[];
  nextAction: string;
} {
  const missing: string[] = [];
  
  if (!state.system) {
    missing.push('system');
  }
  
  // For Email/Jira Interns: targetEmployeeId must come BEFORE accessLevel
  // This ensures we ask "Whose email access do you need?" before asking for access level
  if ((state.system === 'Email' || state.system === 'Jira') && 
      state.role === 'Intern' && 
      !state.targetEmployeeId) {
    missing.push('targetEmployeeId');
  }
  
  // GitHub requires project before access level
  if (state.system === 'GitHub' && !state.project) {
    missing.push('project');
  }
  
  // Access level is asked after system-specific fields (targetEmployeeId for Email/Jira, project for GitHub)
  if (!state.accessLevel) {
    missing.push('accessLevel');
  }
  
  const nextAction = missing.length > 0 
    ? `Need: ${missing[0]}` 
    : 'Ready to submit';
  
  return {
    isValid: missing.length === 0,
    missingFields: missing,
    nextAction
  };
}

/**
 * Calculates missing fields based on current state
 * 
 * @param state - The current request state
 * @returns Array of missing field names
 */
export function calculateMissingFields(state: RequestState): string[] {
  return validateRequestState(state).missingFields;
}

/**
 * Calculates agent confidence based on state
 * 
 * Rules:
 * - accessLevel === 'read-only' → HIGH
 * - accessLevel === 'admin' AND role === 'Intern' → LOW
 * - Otherwise → MEDIUM
 * 
 * @param state - The current request state
 * @returns AgentConfidence level
 */
export function calculateConfidence(state: RequestState): AgentConfidence {
  if (!state.accessLevel) {
    return 'MEDIUM';
  }

  // read-only → HIGH confidence
  if (state.accessLevel === 'read-only') {
    return 'HIGH';
  }

  // Intern requesting admin → LOW confidence
  if (state.accessLevel === 'admin' && state.role === 'Intern') {
    return 'LOW';
  }

  return 'MEDIUM';
}

/**
 * Updates request state with new values
 * Handles dependent field clearing (e.g., changing system clears project if not GitHub)
 * Enforces proper status transitions
 * 
 * @param currentState - Current request state
 * @param updates - Partial state updates
 * @returns Updated RequestState
 */
export function updateRequestState(
  currentState: RequestState,
  updates: Partial<RequestState>
): RequestState {
  const newState: RequestState = {
    ...currentState,
    ...updates
  };

  // Clear dependent fields when system changes
  if (updates.system !== undefined && updates.system !== currentState.system) {
    // If changing to non-GitHub system, clear project
    if (updates.system !== 'GitHub') {
      newState.project = undefined;
    }
    // If changing system, clear access level as it might be system-specific
    newState.accessLevel = undefined;
  }

  // Recalculate derived fields
  const validation = validateRequestState(newState);
  newState.missingFields = validation.missingFields;
  newState.agentConfidence = calculateConfidence(newState);

  // Enforce proper status transitions (never skip states)
  // DRAFT → IN_PROGRESS: when system is selected
  if (newState.status === 'DRAFT' && newState.system) {
    newState.status = 'IN_PROGRESS';
  }
  
  // IN_PROGRESS → AWAITING_APPROVAL: only when all required fields are present
  // Note: This transition is handled by processStateUpdate/transitionToAwaitingApproval
  // We don't do it here to avoid conflicts with auto-submission logic

  // Save updated state
  requestStates.set(newState.user, newState);

  return newState;
}

/**
 * Checks if state is ready for auto-submission
 * 
 * @param state - The current request state
 * @returns True if all required fields are present
 */
export function shouldAutoSubmit(state: RequestState): boolean {
  const missing = calculateMissingFields(state);
  
  // All required fields present and no missing fields
  return missing.length === 0 && 
         state.system !== undefined && 
         state.accessLevel !== undefined &&
         (state.system !== 'GitHub' || state.project !== undefined) &&
         ((state.system !== 'Email' && state.system !== 'Jira') || 
          state.role !== 'Intern' || 
          state.targetEmployeeId !== undefined);
}

/**
 * Validates state transition
 * 
 * @param fromStatus - Current status
 * @param toStatus - Target status
 * @returns True if transition is valid
 */
export function validateStateTransition(
  fromStatus: TaskRequestStatus,
  toStatus: TaskRequestStatus
): boolean {
  // Valid transitions
  const validTransitions: Record<TaskRequestStatus, TaskRequestStatus[]> = {
    'DRAFT': ['IN_PROGRESS', 'DRAFT'],
    'IN_PROGRESS': ['IN_PROGRESS', 'AWAITING_APPROVAL', 'DRAFT'],
    'AWAITING_APPROVAL': ['APPROVED', 'REJECTED', 'DRAFT'],
    'APPROVED': ['DRAFT'],
    'REJECTED': ['DRAFT']
  };

  return validTransitions[fromStatus]?.includes(toStatus) || false;
}

/**
 * Resets request state to DRAFT
 * Safe reset: discards old state, returns fresh initial state
 * Never throws, always returns valid state
 * 
 * @param userId - The ID of the user
 * @param role - The role of the user (required for safe reset)
 * @returns Reset RequestState
 */
export function resetRequestState(userId: string, role: UserRole): RequestState {
  // Discard old state completely, create fresh initial state
  const resetState = createInitialRequestState(userId, role);
  requestStates.set(userId, resetState);
  return resetState;
}

/**
 * Clears request state for a user
 * 
 * @param userId - The ID of the user
 */
export function clearRequestState(userId: string): void {
  requestStates.delete(userId);
}

/**
 * Updates RequestState to APPROVED when an access request is approved
 * 
 * @param userId - The ID of the user whose request was approved
 * @param accessLink - The generated access link
 * @param approverId - The ID of the approver
 * @param approverRole - The role of the approver
 * @param approvedAt - ISO timestamp when approved
 * @returns Updated RequestState or null if state not found
 */
export function updateRequestStateFromApproval(
  userId: string,
  accessLink: string,
  approverId?: string,
  approverRole?: UserRole,
  approvedAt?: string
): RequestState | null {
  const currentState = requestStates.get(userId);
  
  if (!currentState) {
    // State might not exist if user hasn't started a request yet
    return null;
  }

  // Only update if state is in AWAITING_APPROVAL
  if (currentState.status !== 'AWAITING_APPROVAL') {
    return currentState;
  }

  // Update state to APPROVED with access link and approver metadata
  const updatedState: RequestState = {
    ...currentState,
    status: 'APPROVED',
    accessLink,
    approverId,
    approverRole,
    approvedAt,
    rejectionReason: undefined, // Clear any previous rejection reason
    rejectedAt: undefined // Clear any previous rejection timestamp
  };

  requestStates.set(userId, updatedState);
  return updatedState;
}

/**
 * Updates RequestState to REJECTED when an access request is rejected
 * 
 * @param userId - The ID of the user whose request was rejected
 * @param reason - The rejection reason
 * @param approverId - The ID of the approver
 * @param approverRole - The role of the approver
 * @param rejectedAt - ISO timestamp when rejected
 * @returns Updated RequestState or null if state not found
 */
export function updateRequestStateFromRejection(
  userId: string,
  reason: string,
  approverId?: string,
  approverRole?: UserRole,
  rejectedAt?: string
): RequestState | null {
  const currentState = requestStates.get(userId);
  
  if (!currentState) {
    // State might not exist if user hasn't started a request yet
    return null;
  }

  // Only update if state is in AWAITING_APPROVAL
  if (currentState.status !== 'AWAITING_APPROVAL') {
    return currentState;
  }

  // Update state to REJECTED with rejection reason and approver metadata
  const updatedState: RequestState = {
    ...currentState,
    status: 'REJECTED',
    rejectionReason: reason,
    approverId,
    approverRole,
    rejectedAt,
    accessLink: undefined, // Clear any previous access link
    approvedAt: undefined // Clear any previous approval timestamp
  };

  requestStates.set(userId, updatedState);
  return updatedState;
}

