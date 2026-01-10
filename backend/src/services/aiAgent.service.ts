/**
 * AI Agent Service
 * 
 * Mocked OpenAI-style LLM interface for:
 * - Intent parsing from natural language
 * - Generating follow-up questions when data is missing
 * - Explaining reasoning for access decisions
 * 
 * Security Principle: This service NEVER overrides RBAC rules.
 * It only provides explanations and asks clarifying questions.
 * All access decisions come from the rule engine.
 */

import { 
  ParsedIntent, 
  SystemName, 
  AccessLevel, 
  AIResponse,
  ValidationResult,
  RequestState 
} from '../models/AccessRequest';

/**
 * Parses user intent from natural language message
 * 
 * This is a simplified mock implementation. In production, this would
 * call an actual LLM API (OpenAI, Anthropic, etc.) with proper prompts.
 * 
 * @param message - User's natural language request
 * @returns ParsedIntent with extracted information
 */
export function parseIntent(message: string): ParsedIntent {
  const lowerMessage = message.toLowerCase();
  
  // Extract system name
  let system: SystemName | undefined;
  if (lowerMessage.includes('email') || lowerMessage.includes('mail')) {
    system = 'Email';
  } else if (lowerMessage.includes('github') || lowerMessage.includes('git') || lowerMessage.includes('repo')) {
    system = 'GitHub';
  } else if (lowerMessage.includes('jira') || lowerMessage.includes('ticket')) {
    system = 'Jira';
  }

  // Extract access level (system-specific)
  let accessLevel: AccessLevel | undefined;
  
  // Jira-specific role mapping: viewer, contributor, admin
  if (system === 'Jira') {
    if (lowerMessage.includes('admin') || lowerMessage.includes('administrator')) {
      accessLevel = 'admin';
    } else if (lowerMessage.includes('contributor') || lowerMessage.includes('create') || lowerMessage.includes('edit')) {
      accessLevel = 'create-edit';
    } else if (lowerMessage.includes('viewer') || lowerMessage.includes('view') || lowerMessage.includes('see')) {
      accessLevel = 'view';
    } else if (lowerMessage.includes('comment')) {
      accessLevel = 'comment';
    }
  } else {
    // Email and GitHub use standard access levels
    if (lowerMessage.includes('admin') || lowerMessage.includes('administrator')) {
      accessLevel = 'admin';
    } else if (lowerMessage.includes('read') && lowerMessage.includes('write')) {
      accessLevel = 'read-write';
    } else if (lowerMessage.includes('read-only') || lowerMessage.includes('read only')) {
      accessLevel = 'read-only';
    } else if (lowerMessage.includes('write') || lowerMessage.includes('edit') || lowerMessage.includes('create')) {
      accessLevel = 'read-write';
    } else if (lowerMessage.includes('comment')) {
      accessLevel = 'comment';
    } else if (lowerMessage.includes('view') || lowerMessage.includes('see')) {
      accessLevel = 'view';
    }
  }

  // Extract project name (look for patterns like "for project X", "to X repo", etc.)
  let project: string | undefined;
  let projectId: string | undefined;
  const projectPatterns = [
    /(?:for|to|on)\s+(?:the\s+)?(?:project\s+)?(alpha|beta)/i,
    /(?:project\s+)?(alpha|beta)/i,
    /(?:repo|repository)\s+(alpha|beta)/i
  ];
  
  for (const pattern of projectPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const projectName = match[1].toLowerCase();
      project = projectName === 'alpha' ? 'Project Alpha' : 'Project Beta';
      projectId = projectName === 'alpha' ? 'project-1' : 'project-2';
      break;
    }
  }

  // Extract target employee name/ID (for employee-owned access)
  let targetEmployeeId: string | undefined;
  const users = require('../data/users.json');
  for (const user of users) {
    const userName = user.name.toLowerCase();
    // Check if message contains employee name
    if (lowerMessage.includes(userName) || message.includes(user.name)) {
      targetEmployeeId = user.id;
      break;
    }
    // Also check for employee ID patterns like "employee-1", "manager-001", etc.
    if (lowerMessage.includes(user.id.toLowerCase())) {
      targetEmployeeId = user.id;
      break;
    }
  }

  // Determine confidence based on how much we extracted
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (system && accessLevel) {
    confidence = project ? 'high' : 'medium';
  } else if (system || accessLevel) {
    confidence = 'medium';
  }

  return {
    system,
    accessLevel,
    project,
    projectId,
    targetEmployeeId,
    confidence
  };
}

/**
 * Generates a follow-up question when required information is missing
 * 
 * @param missingFields - Array of fields that are missing
 * @returns AIResponse with clarification question
 */
export function generateClarificationQuestion(missingFields: string[]): AIResponse {
  // Ask for first missing field only (state-aware approach)
  if (missingFields.length > 0) {
    const firstField = missingFields[0];
    const questions: Record<string, string> = {
      system: "Which system? (Email, GitHub, or Jira)",
      accessLevel: "What access level? (read-only, read-write, or admin)",
      project: "Which project? (Alpha or Beta)"
    };
    
    const question = questions[firstField] || "Please provide more information.";
    return {
      message: truncateMessage(question),
      needsClarification: true,
      clarificationQuestion: question
    };
  }

  return {
    message: truncateMessage("Please provide more details."),
    needsClarification: true,
    clarificationQuestion: "Please provide more details."
  };
}

/**
 * Generates an explanation for an access decision
 * 
 * @param validationResult - Result from rule engine validation
 * @param userRole - Role of the user making the request
 * @param system - System requested
 * @param requestedAccessLevel - Access level requested
 * @returns AIResponse with explanation
 */
export function explainDecision(
  validationResult: ValidationResult,
  userRole: string,
  system: SystemName,
  requestedAccessLevel: AccessLevel,
  projectName?: string,
  assignedApproverId?: string,
  targetEmployeeId?: string
): AIResponse {
  if (!validationResult.isValid) {
    // Check if this is a project assignment issue requiring escalation
    if (validationResult.requiresEscalation && validationResult.escalationTo) {
      return generateEscalationMessage(
        system,
        requestedAccessLevel,
        projectName || 'the project',
        validationResult.escalationTo
      );
    }
    
    // Provide system-specific and role-specific error messages
    let message: string;
    if (validationResult.rejectionReason) {
      message = validationResult.rejectionReason;
    } else if (system === 'Email' && userRole === 'Intern' && requestedAccessLevel === 'admin') {
      message = "Admin access not available for Email. Choose read-only, read-write, or default.";
    } else if (system === 'Jira' && userRole === 'Intern' && requestedAccessLevel === 'admin') {
      message = "Admin access requires approval. Choose viewer, contributor, or request escalation.";
    } else if (system === 'Email' && requestedAccessLevel === 'admin') {
      message = "Admin access not available for Email. Choose read-only, read-write, or default.";
    } else {
      message = `Cannot approve: ${requestedAccessLevel} access to ${system} not permitted for ${userRole}.`;
    }
    
    return {
      message: truncateMessage(message),
      needsClarification: true,
      clarificationQuestion: message,
      reasoning: `RBAC rules do not allow ${userRole} to have ${requestedAccessLevel} access to ${system}.`
    };
  }

  if (validationResult.downgradeReason) {
    const message = `Adjusted: ${validationResult.downgradeReason} Access: ${validationResult.allowedAccessLevel}`;
    return {
      message: truncateMessage(message),
      needsClarification: false,
      reasoning: `Based on your role (${userRole}), access level adjusted.`
    };
  }

  if (validationResult.requiresApproval) {
    // Determine approver name for better messaging
    let approverInfo = "Manager or IT Admin";
    if (assignedApproverId) {
      const users = require('../data/users.json');
      const approver = users.find((u: any) => u.id === assignedApproverId);
      if (approver) {
        approverInfo = approver.name;
        if (targetEmployeeId) {
          approverInfo += " (Account Owner)";
        } else if (projectName) {
          approverInfo += " (Project Owner)";
        }
      }
    }
    
    const message = `Request submitted. Awaiting approval from ${approverInfo}.`;
    return {
      message: truncateMessage(message),
      needsClarification: false,
      reasoning: `Your role (${userRole}) allows this access, but approval required from ${approverInfo}.`
    };
  }

  const message = `Request approved. Access granted immediately.`;
  return {
    message: truncateMessage(message),
    needsClarification: false,
    reasoning: `Your role (${userRole}) has automatic permission.`
  };
}

/**
 * Generates an escalation message when project access is denied
 * 
 * @param system - The system requested
 * @param accessLevel - The access level requested
 * @param projectName - The name of the project
 * @param managerId - The ID of the manager to escalate to
 * @returns AIResponse with escalation offer
 */
export function generateEscalationMessage(
  system: SystemName,
  accessLevel: AccessLevel,
  projectName: string,
  managerId: string
): AIResponse {
  const users = require('../data/users.json');
  const manager = users.find((u: any) => u.id === managerId);
  const managerName = manager?.name || 'project manager';

  const message = `Not assigned to ${projectName}. Escalate to ${managerName}?`;
  return {
    message: truncateMessage(message),
    needsClarification: true,
    clarificationQuestion: `Escalate to ${managerName}?`,
    reasoning: `Project-level authorization requires assignment. Escalation needed to ${managerName}.`
  };
}

/**
 * Parses intent from message with state context
 * Only extracts fields that are not already in state
 * 
 * @param message - User's natural language message
 * @param currentState - Current request state
 * @returns ParsedIntent with only new information
 */
export function parseIntentFromMessage(message: string, currentState: RequestState): Partial<ParsedIntent> {
  const intent = parseIntent(message);
  const updates: Partial<ParsedIntent> = {};

  // Allow corrections: if user explicitly mentions a field, update it
  // This enables users to correct previous answers (e.g., "actually, make it read-only")
  if (intent.system) {
    updates.system = intent.system;
  }

  if (intent.accessLevel) {
    updates.accessLevel = intent.accessLevel;
  }

  if (intent.project) {
    updates.project = intent.project;
    updates.projectId = intent.projectId;
  }

  if (intent.targetEmployeeId) {
    updates.targetEmployeeId = intent.targetEmployeeId;
  }

  return updates;
}

/**
 * Generates a question for ONE missing field
 * System-specific questions for enterprise workflow
 * 
 * @param field - The missing field name
 * @param state - Current request state
 * @returns AIResponse with question (≤120 chars)
 */
export function generateQuestionForMissingField(field: string, state: RequestState): AIResponse {
  // System-specific questions based on current system selection
  let question: string;

  if (field === 'system') {
    question = "Which system? (Email, GitHub, or Jira)";
  } else if (field === 'targetEmployeeId' && state.system === 'Email') {
    // Email-specific: Ask for employee selection
    question = "Whose email access do you need?";
  } else if (field === 'targetEmployeeId' && state.system === 'Jira') {
    // Jira-specific: Ask for employee selection
    question = "Whose Jira account do you need access to?";
  } else if (field === 'project' && state.system === 'GitHub') {
    // GitHub-specific: Ask for project/repository
    question = "Which project or repository? (Alpha or Beta)";
  } else if (field === 'project' && state.system === 'Jira') {
    // Jira-specific: Ask for project
    question = "Which Jira project? (Alpha or Beta)";
  } else if (field === 'accessLevel' && state.system === 'Email') {
    // Email-specific: Ask for access level (will be mapped to default for Interns)
    question = "What access level? (read-only, read-write, or admin)";
  } else if (field === 'accessLevel' && state.system === 'GitHub') {
    // GitHub-specific: Ask for access level
    question = "What access level? (read-only, read-write, or admin)";
  } else if (field === 'accessLevel' && state.system === 'Jira') {
    // Jira-specific: Ask for role type
    question = "What role? (viewer, contributor, or admin)";
  } else {
    question = "Please provide more information.";
  }

  // Enforce 120-character limit
  const message = question.length > 120 ? question.substring(0, 117) + '...' : question;

  return {
    message,
    needsClarification: true,
    clarificationQuestion: question
  };
}

/**
 * Generates state-aware response based on current state
 * Handles terminal states and system-specific flows
 * 
 * @param state - Current request state
 * @param updates - Updates that were applied
 * @param requiresApproval - Optional flag indicating if approval is required (for conditional messaging)
 * @param assignedApproverId - Optional approver ID for approval routing messages
 * @returns AIResponse (≤120 chars)
 */
export function generateStateAwareResponse(
  state: RequestState, 
  updates: Partial<RequestState>,
  requiresApproval?: boolean,
  assignedApproverId?: string
): AIResponse {
  // Check for terminal states (APPROVED or REJECTED) - ask what's next
  if (state.status === 'APPROVED') {
    // Show approval message with access link if available
    if (state.accessLink) {
      const message = `Request approved. Access granted. Link: ${state.accessLink}`;
      return {
        message: truncateMessage(message),
        needsClarification: false,
        reasoning: "Request auto-approved based on your role."
      };
    }
    const message = "Request approved. Access granted immediately.";
    return {
      message: truncateMessage(message),
      needsClarification: false,
      reasoning: "Request auto-approved based on your role."
    };
  }
  
  if (state.status === 'REJECTED') {
    const message = "What would you like to access next? (Email, GitHub, or Jira)";
    return {
      message: truncateMessage(message),
      needsClarification: true,
      clarificationQuestion: message
    };
  }

  // If LOW confidence and Intern requesting admin, offer downgrade
  if (state.agentConfidence === 'LOW' && state.role === 'Intern' && state.accessLevel === 'admin') {
    const message = "Admin requires approval. Choose read-only or read-write?";
    return {
      message: message.length > 120 ? message.substring(0, 117) + '...' : message,
      needsClarification: true,
      clarificationQuestion: "Choose read-only or read-write?"
    };
  }

  // If all fields present, check if approval is required
  if (state.missingFields.length === 0) {
    const system = state.system || 'system';
    const level = state.accessLevel || 'access';
    
    // If requiresApproval is explicitly false (auto-approved), show approval message
    if (requiresApproval === false) {
      const message = "Request approved. Access granted immediately.";
      return {
        message: truncateMessage(message),
        needsClarification: false,
        reasoning: "Request auto-approved based on your role."
      };
    }
    
    // If requiresApproval is true or undefined, show approval pending message
    let approverInfo = "Manager or IT Admin";
    if (assignedApproverId) {
      const users = require('../data/users.json');
      const approver = users.find((u: any) => u.id === assignedApproverId);
      if (approver) {
        approverInfo = approver.name;
        if (state.targetEmployeeId) {
          approverInfo += " (Account Owner)";
        } else if (state.project) {
          approverInfo += " (Project Owner)";
        }
      }
    }
    
    const message = `Request submitted: ${level} access to ${system}. Awaiting approval from ${approverInfo}.`;
    return {
      message: message.length > 120 ? message.substring(0, 117) + '...' : message,
      needsClarification: false
    };
  }

  // Ask for next missing field (system-specific)
  const nextField = state.missingFields[0];
  return generateQuestionForMissingField(nextField, state);
}

/**
 * Truncates message to 120 characters
 * 
 * @param message - Message to truncate
 * @returns Truncated message
 */
function truncateMessage(message: string): string {
  if (message.length <= 120) {
    return message;
  }
  return message.substring(0, 117) + '...';
}

/**
 * Generates validation error message for missing fields
 * Returns ≤120 character explanation
 * 
 * @param missingField - The missing field name
 * @param state - Current request state
 * @returns AIResponse with validation error message
 */
export function generateValidationError(missingField: string, state: RequestState): AIResponse {
  // System-specific validation error messages
  let message: string;

  if (missingField === 'system') {
    message = "System selection required. Choose Email, GitHub, or Jira.";
  } else if (missingField === 'targetEmployeeId' && state.system === 'Email') {
    message = "Email owner required. Whose email access do you need?";
  } else if (missingField === 'targetEmployeeId' && state.system === 'Jira') {
    message = "Account owner required. Whose Jira account do you need access to?";
  } else if (missingField === 'project' && state.system === 'GitHub') {
    message = "GitHub requires a project. Which project or repository? (Alpha or Beta)";
  } else if (missingField === 'project' && state.system === 'Jira') {
    message = "Jira project required. Which project? (Alpha or Beta)";
  } else if (missingField === 'accessLevel' && state.system === 'Email') {
    message = "Access level required. Choose read-only, read-write, or admin.";
  } else if (missingField === 'accessLevel' && state.system === 'GitHub') {
    message = "Access level required. Choose read-only, read-write, or admin.";
  } else if (missingField === 'accessLevel' && state.system === 'Jira') {
    message = "Role required. Choose viewer, contributor, or admin.";
  } else {
    message = "Missing required field. Please provide more information.";
  }
  
  return {
    message: truncateMessage(message),
    needsClarification: true,
    clarificationQuestion: message,
    reasoning: `Validation failed: ${missingField} is required but not provided.`
  };
}

/**
 * Generates a welcome message for the chat interface
 */
export function generateWelcomeMessage(): AIResponse {
  const message = "Which system? (Email, GitHub, or Jira)";
  return {
    message: truncateMessage(message),
    needsClarification: true,
    clarificationQuestion: message
  };
}

/**
 * Mock OpenAI-style completion function
 * 
 * In production, this would call the actual OpenAI API with a properly
 * structured prompt. For this assessment, we use rule-based logic.
 * 
 * @param prompt - The prompt to send to the AI
 * @returns AIResponse
 */
export async function mockOpenAICompletion(prompt: string): Promise<AIResponse> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));

  // This is a simplified mock - in production, this would be an actual API call
  // The prompt would include context about RBAC rules, user role, etc.
  
  if (prompt.includes('welcome') || prompt.includes('hello') || prompt.includes('start')) {
    return generateWelcomeMessage();
  }

  // For other prompts, parse intent and generate response
  const intent = parseIntent(prompt);
  
  const missingFields: string[] = [];
  if (!intent.system) missingFields.push('system');
  if (!intent.accessLevel) missingFields.push('accessLevel');
  
  if (missingFields.includes('project')) {
    return {
      message: "I need to know which project you need access for. Are you requesting access for Project Alpha or Project Beta?",
      needsClarification: true,
      clarificationQuestion: "Which project do you need access for? (Project Alpha or Project Beta)"
    };
  }
  
  if (missingFields.length > 0) {
    return generateClarificationQuestion(missingFields);
  }

  // If we have enough information, return a generic response
  // (The actual decision will be made by the rule engine)
  return {
    message: `I understand you're requesting ${intent.accessLevel} access to ${intent.system}. Let me process this request...`,
    needsClarification: false
  };
}

