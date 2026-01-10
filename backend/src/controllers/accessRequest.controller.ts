/**
 * Access Request Controller
 * 
 * Handles HTTP requests for access requests.
 * Orchestrates rule engine, AI agent, and approval service.
 */

import { Request, Response } from 'express';
import { parseIntent, explainDecision, generateClarificationQuestion, parseIntentFromMessage, generateStateAwareResponse, generateValidationError } from '../services/aiAgent.service';
import { validateAccessRequest } from '../services/ruleEngine.service';
import { validateAccessRequest } from '../services/ruleEngine.service';
import {
  createAccessRequest, 
  determineApprover,
  getPendingApprovalsForManager,
  getPendingApprovalsCount,
  approveRequest,
  rejectRequest
} from '../services/approval.service';
import {
  createEscalationRequest,
  getEscalationRequest
} from '../services/escalation.service';
import {
  getRequestState,
  initializeRequestState,
  updateRequestState,
  validateRequestState,
  resetRequestState,
  updateRequestStateFromApproval,
  updateRequestStateFromRejection
} from '../services/requestState.service';
import {
  processStateUpdate,
  handleRecovery
} from '../services/stateTransition.service';
import projects from '../data/projects.json';
import projectAssignments from '../data/projectAssignments.json';
import { 
  AccessRequestResponse, 
  RequestStatus, 
  UserRole, 
  SystemName, 
  AccessLevel,
  AccessRequest,
  RequestState
} from '../models/AccessRequest';
import usersData from '../data/users.json';

interface AccessRequestBody {
  userId: string;
  message: string;
  projectId?: string;
}

/**
 * POST /api/access-request
 * 
 * Processes an access request from the chat interface.
 * 
 * Flow:
 * 1. Parse user intent from message (AI)
 * 2. Load user profile
 * 3. Validate request against RBAC rules
 * 4. If missing data, ask clarifying question
 * 5. Create access request with appropriate status
 * 6. Return structured response
 */
export async function handleAccessRequest(req: Request, res: Response): Promise<void> {
  try {
    const { userId, message, projectId }: AccessRequestBody = req.body;

    // Validate input
    if (!userId || !message) {
      res.status(400).json({
        error: 'Missing required fields: userId and message are required'
      });
      return;
    }

    // Load user profile
    const user = usersData.find(u => u.id === userId);
    if (!user) {
      res.status(404).json({
        error: `User with ID ${userId} not found`
      });
      return;
    }

    // Parse intent from user message
    const intent = parseIntent(message);

    // Use projectId from request body or parsed from intent
    const finalProjectId = projectId || intent.projectId;

    // Check if we need clarification
    const missingFields: string[] = [];
    if (!intent.system) missingFields.push('system');
    if (!intent.accessLevel) missingFields.push('accessLevel');
    if (!finalProjectId) missingFields.push('project');

    if (missingFields.length > 0) {
      const clarification = generateClarificationQuestion(missingFields);
      res.json({
        requestId: null,
        status: 'pending' as RequestStatus,
        message: clarification.message,
        reasoning: clarification.reasoning,
        needsClarification: true,
        clarificationQuestion: clarification.clarificationQuestion,
        requiresApproval: false
      } as AccessRequestResponse & { needsClarification: boolean; clarificationQuestion?: string });
      return;
    }

    // Validate request against RBAC rules (with project check)
    const validationResult = validateAccessRequest(
      userId,
      user.role as UserRole,
      intent.system as SystemName,
      intent.accessLevel as AccessLevel,
      finalProjectId
    );

    // Get project name for explanation
    const project = finalProjectId ? (projects as any[]).find((p: any) => p.id === finalProjectId) : null;
    const projectName = project?.name || intent.project;

    // Determine assigned approver for explanation message
    let assignedApproverId: string | undefined = undefined;
    if (finalProjectId) {
      const projectForApprover = (projects as any[]).find((p: any) => p.id === finalProjectId);
      if (projectForApprover && projectForApprover.managerId) {
        assignedApproverId = projectForApprover.managerId;
      }
    } else if (intent.targetEmployeeId) {
      assignedApproverId = intent.targetEmployeeId;
    }

    // Generate explanation for the decision
    const explanation = explainDecision(
      validationResult,
      user.role,
      intent.system as SystemName,
      intent.accessLevel as AccessLevel,
      projectName,
      assignedApproverId,
      intent.targetEmployeeId
    );

    // If request is invalid, return rejection or escalation offer
    if (!validationResult.isValid) {
      res.json({
        requestId: null,
        status: 'rejected' as RequestStatus,
        message: explanation.message,
        reasoning: explanation.reasoning,
        requiresApproval: false,
        requiresEscalation: validationResult.requiresEscalation,
        escalationTo: validationResult.escalationTo,
        rejectionReason: validationResult.rejectionReason
      } as AccessRequestResponse);
      return;
    }

    // Determine approver if needed
    const tempRequest: AccessRequest = {
      id: 'temp',
      userId: user.id,
      userName: user.name,
      userRole: user.role as UserRole,
      system: intent.system as SystemName,
      accessLevel: validationResult.allowedAccessLevel || intent.accessLevel as AccessLevel,
      project: intent.project,
      reason: intent.reason,
      status: validationResult.requiresApproval ? 'pending' : 'approved',
      requiresApproval: validationResult.requiresApproval,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const approverRole = validationResult.requiresApproval ? determineApprover(tempRequest) : null;

    // Determine projectOwnerManagerId from projectId (for GitHub/project-based requests)
    let projectOwnerManagerId: string | undefined = undefined;
    if (finalProjectId) {
      const project = (projects as any[]).find((p: any) => p.id === finalProjectId);
      if (project && project.managerId) {
        projectOwnerManagerId = project.managerId;
      }
    }

    // Determine employeeOwnerId (for Email/Jira employee-owned requests)
    let employeeOwnerId: string | undefined = undefined;
    if ((intent.system === 'Email' || intent.system === 'Jira') && intent.targetEmployeeId) {
      employeeOwnerId = intent.targetEmployeeId;
    }

    // Update assignedApproverId (unified primary approver) - reuse variable declared earlier
    // For GitHub requests: use projectOwnerManagerId
    // For Email/Jira employee-owned: use employeeOwnerId
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

    // Create access request
    const accessRequest = createAccessRequest({
      userId: user.id,
      userName: user.name,
      userRole: user.role as UserRole,
      system: intent.system as SystemName,
      accessLevel: validationResult.allowedAccessLevel || intent.accessLevel as AccessLevel,
      project: projectName,
      projectId: finalProjectId,
      projectOwnerManagerId: projectOwnerManagerId,
      targetEmployeeId: intent.targetEmployeeId,
      employeeOwnerId: employeeOwnerId,
      assignedApproverId: assignedApproverId,
      fallbackApproverId: fallbackApproverId,
      reason: intent.reason,
      status: finalRequiresApproval ? 'pending' : 'approved',
      requiresApproval: finalRequiresApproval,
      approvalBy: approverRole || undefined
    });

    // Return response
    const response: AccessRequestResponse = {
      requestId: accessRequest.id,
      status: accessRequest.status,
      message: explanation.message,
      reasoning: explanation.reasoning,
      requiresApproval: accessRequest.requiresApproval,
      requiresEscalation: false,
      approvalBy: accessRequest.approvalBy,
      rejectionReason: accessRequest.rejectionReason
    };

    // Add downgrade info if applicable
    if (validationResult.downgradeReason) {
      response.message = explanation.message;
    }

    res.json(response);

  } catch (error) {
    console.error('Error processing access request:', error);
    res.status(500).json({
      error: 'Internal server error while processing access request'
    });
  }
}

/**
 * GET /api/access-request/:requestId
 * 
 * Retrieves an access request by ID
 */
export function getAccessRequest(req: Request, res: Response): void {
  try {
    const { requestId } = req.params;
    
    // Import here to avoid circular dependency issues
    const { getAccessRequest } = require('../services/approval.service');
    const request = getAccessRequest(requestId);

    if (!request) {
      res.status(404).json({
        error: `Access request with ID ${requestId} not found`
      });
      return;
    }

    res.json(request);
  } catch (error) {
    console.error('Error retrieving access request:', error);
    res.status(500).json({
      error: 'Internal server error while retrieving access request'
    });
  }
}

/**
 * POST /api/escalation
 * 
 * Creates an escalation request for project access
 */
export async function handleEscalationRequest(req: Request, res: Response): Promise<void> {
  try {
    const { userId, projectId, system, accessLevel } = req.body;

    // Validate input
    if (!userId || !projectId || !system || !accessLevel) {
      res.status(400).json({
        error: 'Missing required fields: userId, projectId, system, and accessLevel are required'
      });
      return;
    }

    // Get project to find manager
    const project = (projects as any[]).find((p: any) => p.id === projectId);
    if (!project) {
      res.status(404).json({
        error: `Project with ID ${projectId} not found`
      });
      return;
    }

    // Create escalation request
    const escalation = createEscalationRequest(
      userId,
      projectId,
      system as SystemName,
      accessLevel as AccessLevel,
      project.managerId
    );

    res.json({
      escalationId: escalation.id,
      status: escalation.status,
      message: `Escalation request submitted to project manager. You will be notified of the decision.`,
      escalationTo: escalation.escalationTo
    });

  } catch (error) {
    console.error('Error processing escalation request:', error);
    res.status(500).json({
      error: 'Internal server error while processing escalation request'
    });
  }
}

/**
 * GET /api/escalation/:escalationId
 * 
 * Retrieves an escalation request by ID
 */
export function getEscalation(req: Request, res: Response): void {
  try {
    const { escalationId } = req.params;
    const escalation = getEscalationRequest(escalationId);

    if (!escalation) {
      res.status(404).json({
        error: `Escalation request with ID ${escalationId} not found`
      });
      return;
    }

    res.json(escalation);
  } catch (error) {
    console.error('Error retrieving escalation request:', error);
    res.status(500).json({
      error: 'Internal server error while retrieving escalation request'
    });
  }
}

/**
 * POST /api/request-state/update
 * 
 * Updates request state based on user message
 * State-aware task-driven agent endpoint
 */
export async function handleRequestStateUpdate(req: Request, res: Response): Promise<void> {
  try {
    const { userId, currentState, message } = req.body;

    // Validate input
    if (!userId || !message) {
      res.status(400).json({
        error: 'Missing required fields: userId and message are required'
      });
      return;
    }

    // Load user profile
    const user = usersData.find(u => u.id === userId);
    if (!user) {
      res.status(404).json({
        error: `User with ID ${userId} not found`
      });
      return;
    }

    // Get or initialize request state
    let state = currentState ? currentState as RequestState : getRequestState(userId);
    
    if (!state) {
      state = initializeRequestState(userId, user.role as UserRole);
    }

    // Handle terminal states (APPROVED or REJECTED)
    // If user mentions a system, reset state and start fresh
    if ((state.status === 'APPROVED' || state.status === 'REJECTED')) {
      const intent = parseIntent(message);
      // If user mentions a system, reset and start new request
      if (intent.system) {
        const { resetRequestState } = require('../services/requestState.service');
        state = resetRequestState(userId, user.role as UserRole);
      } else {
        // Otherwise, ask what they want to access next
        const response = generateStateAwareResponse(state, {});
        res.json({
          newState: state,
          response: response.message,
          nextAction: 'Need: system',
          reasoning: response.reasoning
        });
        return;
      }
    }

    // Parse intent from message with state context (allows corrections)
    const intent = parseIntentFromMessage(message, state);

    // Prepare updates
    const updates: Partial<RequestState> = {};
    
    if (intent.system) {
      updates.system = intent.system;
    }
    
    if (intent.accessLevel) {
      updates.accessLevel = intent.accessLevel;
    }
    
    if (intent.project) {
      updates.project = intent.project;
    }
    
    if (intent.targetEmployeeId) {
      updates.targetEmployeeId = intent.targetEmployeeId;
    }

    // Normal state update (handles corrections automatically)
    // Apply updates first - validation will happen after
    state = processStateUpdate(state, updates);

    // Validate state after update
    const finalValidation = validateRequestState(state);
    
    // If validation fails (missing required fields), return error response
    // But state is still updated with whatever fields were provided
    if (!finalValidation.isValid) {
      const errorResponse = generateValidationError(finalValidation.missingFields[0], state);
      res.json({
        newState: state, // Return updated state even if incomplete
        response: errorResponse.message,
        nextAction: finalValidation.nextAction,
        reasoning: errorResponse.reasoning
      });
      return;
    }

    // Check for LOW confidence blocking scenario (Intern + admin)
    // If LOW confidence, don't proceed to auto-submission, ask for correction
    if (state.agentConfidence === 'LOW' && state.role === 'Intern' && state.accessLevel === 'admin') {
      const response = generateStateAwareResponse(state, updates);
      res.json({
        newState: state,
        response: response.message,
        nextAction: 'Need: accessLevel correction',
        reasoning: response.reasoning
      });
      return;
    }

    // Get validation result from RBAC to determine if approval is required
    let requiresApproval: boolean | undefined = undefined;
    let assignedApproverId: string | undefined = undefined;
    
    if (state.system && state.accessLevel) {
      const rbacValidation = validateAccessRequest(
        state.user,
        state.role,
        state.system,
        state.accessLevel,
        state.project === 'Project Alpha' ? 'project-1' : state.project === 'Project Beta' ? 'project-2' : undefined
      );
      
      if (rbacValidation.isValid) {
        // Determine if employee-owned request (always requires approval)
        const isEmployeeOwnedRequest = (state.system === 'Email' || state.system === 'Jira') && state.targetEmployeeId !== undefined;
        requiresApproval = isEmployeeOwnedRequest ? true : rbacValidation.requiresApproval;
        
        // Determine assigned approver
        if (state.project) {
          const projectId = state.project === 'Project Alpha' ? 'project-1' : state.project === 'Project Beta' ? 'project-2' : undefined;
          if (projectId) {
            const projects = require('../data/projects.json');
            const project = projects.find((p: any) => p.id === projectId);
            if (project?.managerId) {
              assignedApproverId = project.managerId;
            }
          }
        } else if (state.targetEmployeeId) {
          assignedApproverId = state.targetEmployeeId;
        }
      }
    }

    // Generate response based on state
    const response = generateStateAwareResponse(state, updates, requiresApproval, assignedApproverId);

    // Determine next action from validation result
    const nextAction = finalValidation.nextAction;

    res.json({
      newState: state,
      response: response.message,
      nextAction,
      reasoning: response.reasoning
    });

  } catch (error) {
    console.error('Error updating request state:', error);
    res.status(500).json({
      error: 'Internal server error while updating request state'
    });
  }
}

/**
 * GET /api/request-state/:userId
 * 
 * Gets current request state for a user
 */
export function getRequestStateForUser(req: Request, res: Response): void {
  try {
    const { userId } = req.params;
    
    const user = usersData.find(u => u.id === userId);
    if (!user) {
      res.status(404).json({
        error: `User with ID ${userId} not found`
      });
      return;
    }

    let state = getRequestState(userId);
    
    if (!state) {
      state = initializeRequestState(userId, user.role as UserRole);
    }

    res.json(state);
  } catch (error) {
    console.error('Error retrieving request state:', error);
    res.status(500).json({
      error: 'Internal server error while retrieving request state'
    });
  }
}

/**
 * POST /api/request-state/:userId/reset
 * 
 * Resets request state to DRAFT
 * Safe reset: never throws, always returns valid state
 */
export function resetRequestStateForUser(req: Request, res: Response): void {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      res.status(400).json({
        error: 'Missing required parameter: userId'
      });
      return;
    }

    // Load user profile to get role
    const user = usersData.find(u => u.id === userId);
    if (!user) {
      res.status(404).json({
        error: `User with ID ${userId} not found`
      });
      return;
    }

    // Safe reset: always returns valid state, never throws
    const state = resetRequestState(userId, user.role as UserRole);

    res.json(state);
  } catch (error) {
    console.error('Error resetting request state:', error);
    // Even on error, try to return a valid initial state
    const { userId } = req.params;
    if (userId) {
      const user = usersData.find(u => u.id === userId);
      if (user) {
        const { createInitialRequestState } = require('../services/requestState.service');
        const fallbackState = createInitialRequestState(userId, user.role as UserRole);
        res.json(fallbackState);
        return;
      }
    }
    res.status(500).json({
      error: 'Internal server error while resetting request state'
    });
  }
}

/**
 * POST /api/approvals/chat-events
 * 
 * Adds a chat message to a user's chat history
 * Used by frontend to add event-driven messages (approvals, rejections)
 */
export function addChatEvent(req: Request, res: Response): void {
  try {
    const { userId, message, sender } = req.body;

    if (!userId || !message) {
      res.status(400).json({
        error: 'Missing required fields: userId and message are required'
      });
      return;
    }

    const user = usersData.find(u => u.id === userId);
    if (!user) {
      res.status(404).json({
        error: `User with ID ${userId} not found`
      });
      return;
    }

    // Validate sender
    const validSender = sender === 'user' || sender === 'assistant' || sender === 'system';
    if (!validSender) {
      res.status(400).json({
        error: 'Invalid sender. Must be "user", "assistant", or "system"'
      });
      return;
    }

    // Return success - frontend will handle adding to chat history
    // This endpoint exists for potential future backend chat storage
    res.json({
      success: true,
      message: 'Chat event processed',
      chatMessage: {
        id: `event-${userId}-${Date.now()}`,
        text: message,
        sender: sender || 'system',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error processing chat event:', error);
    res.status(500).json({
      error: 'Internal server error while processing chat event'
    });
  }
}

/**
 * GET /api/approvals/pending/:managerId
 * 
 * Gets pending approvals for a manager
 */
export function getPendingApprovals(req: Request, res: Response): void {
  try {
    const { managerId } = req.params;
    
    const manager = usersData.find(u => u.id === managerId);
    if (!manager) {
      res.status(404).json({
        error: `Manager with ID ${managerId} not found`
      });
      return;
    }

    // Get pending approvals (filtered by assignedApproverId in service)
    const pendingApprovals = getPendingApprovalsForManager(
      managerId,
      manager.role as UserRole,
      [] // Deprecated - service filters by assignedApproverId directly
    );

    res.json({
      pendingApprovals,
      count: pendingApprovals.length
    });
  } catch (error) {
    console.error('Error retrieving pending approvals:', error);
    res.status(500).json({
      error: 'Internal server error while retrieving pending approvals'
    });
  }
}

/**
 * GET /api/approvals/count/:managerId
 * 
 * Gets count of pending approvals for a manager
 */
export function getPendingApprovalsCountEndpoint(req: Request, res: Response): void {
  try {
    const { managerId } = req.params;
    
    const manager = usersData.find(u => u.id === managerId);
    if (!manager) {
      res.status(404).json({
        error: `Manager with ID ${managerId} not found`
      });
      return;
    }

    // Get count (filtered by assignedApproverId in service)
    const count = getPendingApprovalsCount(
      managerId,
      manager.role as UserRole,
      [] // Deprecated - service filters by assignedApproverId directly
    );

    res.json({ count });
  } catch (error) {
    console.error('Error retrieving pending approvals count:', error);
    res.status(500).json({
      error: 'Internal server error while retrieving pending approvals count'
    });
  }
}

/**
 * POST /api/approvals/approve
 * 
 * Approves an access request
 */
export function approveAccessRequest(req: Request, res: Response): void {
  try {
    const { requestId, approverId } = req.body;

    if (!requestId || !approverId) {
      res.status(400).json({
        error: 'Missing required fields: requestId and approverId are required'
      });
      return;
    }

    const approver = usersData.find(u => u.id === approverId);
    if (!approver) {
      res.status(404).json({
        error: `Approver with ID ${approverId} not found`
      });
      return;
    }

    const approverRole = approver.role as UserRole;
    const result = approveRequest(requestId, approverRole, approverId);

    if (!result) {
      res.status(404).json({
        error: `Access request with ID ${requestId} not found or cannot be approved`
      });
      return;
    }

    // Update RequestState to APPROVED with access link and approver metadata
    const userId = result.request.userId;
    const accessLink = result.event.accessLink || '';
    const approvedAt = result.event.approvedAt || new Date().toISOString();
    updateRequestStateFromApproval(userId, accessLink, approverId, approverRole, approvedAt);

    // Return request and event data for frontend to handle chat messages
    res.json({
      success: true,
      request: result.request,
      event: result.event,
      message: 'Request approved successfully'
    });
  } catch (error: any) {
    console.error('Error approving access request:', error);
    res.status(400).json({
      error: error.message || 'Internal server error while approving access request'
    });
  }
}

/**
 * POST /api/approvals/reject
 * 
 * Rejects an access request
 */
export function rejectAccessRequest(req: Request, res: Response): void {
  try {
    const { requestId, approverId, reason } = req.body;

    if (!requestId || !approverId || !reason) {
      res.status(400).json({
        error: 'Missing required fields: requestId, approverId, and reason are required'
      });
      return;
    }

    const approver = usersData.find(u => u.id === approverId);
    if (!approver) {
      res.status(404).json({
        error: `Approver with ID ${approverId} not found`
      });
      return;
    }

    // Validate rejection reason length
    if (reason.length > 120) {
      res.status(400).json({
        error: 'Rejection reason must be 120 characters or less'
      });
      return;
    }

    const approverRole = approver.role as UserRole;
    const result = rejectRequest(requestId, approverRole, reason, approverId);

    if (!result) {
      res.status(404).json({
        error: `Access request with ID ${requestId} not found or cannot be rejected`
      });
      return;
    }

    // Update RequestState to REJECTED with rejection reason and approver metadata
    const userId = result.request.userId;
    const rejectedAt = result.event.rejectedAt || new Date().toISOString();
    updateRequestStateFromRejection(userId, reason, approverId, approverRole, rejectedAt);

    // Return request and event data for frontend to handle chat messages
    res.json({
      success: true,
      request: result.request,
      event: result.event,
      message: 'Request rejected successfully'
    });
  } catch (error: any) {
    console.error('Error rejecting access request:', error);
    res.status(400).json({
      error: error.message || 'Internal server error while rejecting access request'
    });
  }
}

