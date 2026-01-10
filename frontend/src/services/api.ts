/**
 * API Service
 * 
 * Type-safe client for backend API communication
 */

import { 
  AccessRequestResponse, 
  AccessRequest, 
  EscalationRequest, 
  SystemName, 
  AccessLevel, 
  RequestState,
  PendingApprovalsResponse,
  ApprovalCountResponse,
  ApproveRequestBody,
  RejectRequestBody,
  ApprovalResponse
} from '../types/access';

const API_BASE_URL = '/api';

/**
 * Sends an access request to the backend
 * 
 * @param userId - The ID of the user making the request
 * @param message - The natural language message from the user
 * @param projectId - Optional project ID for project-scoped access
 * @returns Promise resolving to the access request response
 */
export async function submitAccessRequest(
  userId: string,
  message: string,
  projectId?: string | null
): Promise<AccessRequestResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/access-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, message, projectId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit access request');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Retrieves an access request by ID
 * 
 * @param requestId - The ID of the request to retrieve
 * @returns Promise resolving to the access request
 */
export async function getAccessRequest(requestId: string): Promise<AccessRequest> {
  try {
    const response = await fetch(`${API_BASE_URL}/access-request/${requestId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to retrieve access request');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Submits an escalation request for project access
 * 
 * @param userId - The ID of the user requesting escalation
 * @param projectId - The ID of the project
 * @param system - The system for which access is requested
 * @param accessLevel - The access level being requested
 * @returns Promise resolving to the escalation response
 */
export async function submitEscalationRequest(
  userId: string,
  projectId: string,
  system: SystemName,
  accessLevel: AccessLevel
): Promise<{ escalationId: string; status: string; message: string; escalationTo: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/escalation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, projectId, system, accessLevel }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit escalation request');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Retrieves an escalation request by ID
 * 
 * @param escalationId - The ID of the escalation request
 * @returns Promise resolving to the escalation request
 */
export async function getEscalation(escalationId: string): Promise<EscalationRequest> {
  try {
    const response = await fetch(`${API_BASE_URL}/escalation/${escalationId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to retrieve escalation request');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Updates request state based on user message
 * 
 * @param userId - The ID of the user
 * @param currentState - Current request state
 * @param message - User's message
 * @returns Promise resolving to updated state and response
 */
export async function updateRequestState(
  userId: string,
  currentState: RequestState | null,
  message: string
): Promise<{ newState: RequestState; response: string; nextAction: string; reasoning?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/request-state/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, currentState, message }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update request state');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Gets current request state for a user
 * 
 * @param userId - The ID of the user
 * @returns Promise resolving to request state
 */
export async function getRequestState(userId: string): Promise<RequestState> {
  // Validate userId before making API call
  if (!userId || userId === 'reset' || typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('Invalid userId: userId must be a non-empty string');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/request-state/${encodeURIComponent(userId)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to retrieve request state');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Resets request state to DRAFT
 * 
 * @param userId - The ID of the user
 * @returns Promise resolving to reset request state
 */
export async function resetRequestState(userId: string): Promise<RequestState> {
  // Validate userId before making API call
  if (!userId || userId === 'reset' || typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('Invalid userId: userId must be a non-empty string');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/request-state/${encodeURIComponent(userId)}/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reset request state');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Gets pending approvals for a manager
 * 
 * @param managerId - The ID of the manager
 * @returns Promise resolving to pending approvals
 */
export async function getPendingApprovals(managerId: string): Promise<PendingApprovalsResponse> {
  // Validate managerId before making API call
  if (!managerId || typeof managerId !== 'string' || managerId.trim() === '') {
    throw new Error('Invalid managerId: managerId must be a non-empty string');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/approvals/pending/${encodeURIComponent(managerId)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to retrieve pending approvals');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Gets count of pending approvals for a manager
 * 
 * @param managerId - The ID of the manager
 * @returns Promise resolving to approval count
 */
export async function getPendingApprovalsCount(managerId: string): Promise<number> {
  // Validate managerId before making API call
  if (!managerId || typeof managerId !== 'string' || managerId.trim() === '') {
    throw new Error('Invalid managerId: managerId must be a non-empty string');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/approvals/count/${encodeURIComponent(managerId)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to retrieve pending approvals count');
    }

    const data: ApprovalCountResponse = await response.json();
    return data.count;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Approves an access request
 * 
 * @param requestId - The ID of the request to approve
 * @param approverId - The ID of the approver
 * @returns Promise resolving to approval response
 */
export async function approveRequest(
  requestId: string,
  approverId: string
): Promise<ApprovalResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/approvals/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requestId, approverId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to approve request');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Rejects an access request
 * 
 * @param requestId - The ID of the request to reject
 * @param approverId - The ID of the approver
 * @param reason - Reason for rejection
 * @returns Promise resolving to rejection response
 */
export async function rejectRequest(
  requestId: string,
  approverId: string,
  reason: string
): Promise<ApprovalResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/approvals/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requestId, approverId, reason }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reject request');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Adds a chat event message (for event-driven chat updates)
 * 
 * @param userId - The ID of the user
 * @param message - The message text
 * @param sender - The sender type ('user', 'assistant', or 'system')
 * @returns Promise resolving to chat event response
 */
export async function addChatEvent(
  userId: string,
  message: string,
  sender: 'user' | 'assistant' | 'system' = 'system'
): Promise<{ success: boolean; chatMessage: any }> {
  try {
    const response = await fetch(`${API_BASE_URL}/approvals/chat-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, message, sender }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add chat event');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}
