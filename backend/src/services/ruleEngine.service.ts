/**
 * Rule Engine Service
 * 
 * Core access control logic that validates requests against RBAC rules.
 * This service is the single source of truth for access decisions.
 * 
 * Security Principle: All access decisions MUST go through this engine.
 * The AI layer can only provide explanations and questions - it cannot override rules.
 */

import { 
  UserRole, 
  SystemName, 
  AccessLevel, 
  ValidationResult 
} from '../models/AccessRequest';
import accessRules from '../data/accessRules.json';
import projectAssignments from '../data/projectAssignments.json';
import projects from '../data/projects.json';
import users from '../data/users.json';

interface SystemRules {
  default?: boolean;
  readOnly?: boolean;
  readWrite?: boolean;
  admin?: boolean;
  view?: boolean;
  comment?: boolean;
  createEdit?: boolean;
  specificRepo?: boolean;
  requiresApproval: boolean;
  accessLevel?: string;
  note?: string;
}

interface RoleRules {
  [system: string]: SystemRules | { canApprove?: boolean; finalApprovalAuthority?: boolean; note?: string };
  adminAccess?: { requiresApproval: boolean; note?: string };
  canApprove?: boolean;
  finalApprovalAuthority?: boolean;
  note?: string;
}

/**
 * Validates project access for a user
 * 
 * @param userId - The ID of the user
 * @param projectId - The ID of the project
 * @returns Object with isAssigned boolean and managerId if not assigned
 */
export function validateProjectAccess(
  userId: string,
  projectId: string
): { isAssigned: boolean; managerId?: string } {
  // IT Administrators have access to all projects
  const user = (users as any[]).find((u: any) => u.id === userId);
  if (user?.role === 'IT Administrator') {
    return { isAssigned: true };
  }

  const assignments = projectAssignments as Record<string, string[]>;
  const userProjects = assignments[userId] || [];
  const isAssigned = userProjects.includes(projectId);

  if (!isAssigned) {
    // Find the project's manager
    const project = (projects as any[]).find((p: any) => p.id === projectId);
    return {
      isAssigned: false,
      managerId: project?.managerId
    };
  }

  return { isAssigned: true };
}

/**
 * Validates an access request against RBAC rules
 * 
 * @param userId - The ID of the user making the request
 * @param userRole - The role of the user making the request
 * @param system - The system for which access is requested
 * @param requestedAccessLevel - The access level being requested
 * @param projectId - Optional project ID for project-scoped access
 * @returns ValidationResult with decision and reasoning
 */
export function validateAccessRequest(
  userId: string,
  userRole: UserRole,
  system: SystemName,
  requestedAccessLevel: AccessLevel,
  projectId?: string
): ValidationResult {
  // Step 1: Check project assignment FIRST (if projectId is provided)
  if (projectId) {
    const projectAccess = validateProjectAccess(userId, projectId);
    
    if (!projectAccess.isAssigned) {
      return {
        isValid: false,
        requiresApproval: false,
        requiresEscalation: true,
        escalationTo: projectAccess.managerId,
        rejectionReason: `You are not assigned to this project. Access requires escalation to the project manager.`
      };
    }
  }
  const rules = accessRules as Record<UserRole, RoleRules>;
  const roleRules = rules[userRole];

  if (!roleRules) {
    return {
      isValid: false,
      requiresApproval: false,
      rejectionReason: `Unknown role: ${userRole}`
    };
  }

  const systemRules = roleRules[system] as SystemRules | undefined;

  if (!systemRules) {
    return {
      isValid: false,
      requiresApproval: false,
      rejectionReason: `Access to ${system} is not defined for role ${userRole}`
    };
  }

  // Check if requesting admin access
  if (requestedAccessLevel === 'admin') {
    // Only IT Admin and Manager (for Jira) can have admin access
    if (userRole === 'IT Administrator') {
      return {
        isValid: true,
        requiresApproval: false,
        allowedAccessLevel: 'admin'
      };
    }
    
    if (userRole === 'Manager' && system === 'Jira') {
      return {
        isValid: true,
        requiresApproval: false,
        allowedAccessLevel: 'admin'
      };
    }

    // Developers requesting admin access need approval
    if (userRole === 'Developer' && roleRules.adminAccess?.requiresApproval) {
      return {
        isValid: true,
        requiresApproval: true,
        allowedAccessLevel: 'admin'
      };
    }

    // Interns cannot have admin access
    return {
      isValid: false,
      requiresApproval: false,
      rejectionReason: `Role ${userRole} cannot be granted admin access to ${system}`
    };
  }

  // Map requested access level to rule checks
  const accessLevelMap: Record<AccessLevel, (rules: SystemRules) => boolean> = {
    'read-only': (r) => r.readOnly === true,
    'read-write': (r) => r.readWrite === true || r.readOnly === true,
    'admin': (r) => r.admin === true,
    'view': (r) => r.view === true,
    'comment': (r) => r.comment === true || r.view === true,
    'create-edit': (r) => r.createEdit === true || r.comment === true,
    'default': (r) => r.default === true
  };

  const checkAccess = accessLevelMap[requestedAccessLevel];
  
  if (!checkAccess) {
    return {
      isValid: false,
      requiresApproval: false,
      rejectionReason: `Invalid access level: ${requestedAccessLevel}`
    };
  }

  // Check if the requested access level is allowed
  if (!checkAccess(systemRules)) {
    // Try to find a downgraded access level
    const downgradedLevel = findDowngradedAccessLevel(systemRules, requestedAccessLevel, system, userRole);
    
    if (downgradedLevel) {
      return {
        isValid: true,
        requiresApproval: systemRules.requiresApproval,
        allowedAccessLevel: downgradedLevel,
        downgradeReason: `Requested ${requestedAccessLevel} but role ${userRole} is limited to ${downgradedLevel} for ${system}`
      };
    }

    return {
      isValid: false,
      requiresApproval: false,
      rejectionReason: `Role ${userRole} cannot be granted ${requestedAccessLevel} access to ${system}`
    };
  }

  // Access is valid, check if approval is required
  return {
    isValid: true,
    requiresApproval: systemRules.requiresApproval,
    allowedAccessLevel: (systemRules.accessLevel as AccessLevel) || requestedAccessLevel
  };
}

/**
 * Finds a downgraded access level if the requested level is too high
 */
function findDowngradedAccessLevel(
  systemRules: SystemRules,
  requestedLevel: AccessLevel,
  system?: SystemName,
  userRole?: UserRole
): AccessLevel | undefined {
  // For Email Interns: map read-only/read-write/admin to default (Email only supports default for Interns)
  if (system === 'Email' && userRole === 'Intern' && systemRules.default) {
    if (requestedLevel === 'read-only' || requestedLevel === 'read-write' || requestedLevel === 'admin') {
      return 'default';
    }
  }

  // For GitHub: read-write -> read-only
  if (requestedLevel === 'read-write' && systemRules.readOnly) {
    return 'read-only';
  }

  // For Jira: create-edit -> comment -> view
  if (requestedLevel === 'create-edit' && systemRules.comment) {
    return 'comment';
  }
  if (requestedLevel === 'create-edit' && systemRules.view) {
    return 'view';
  }
  if (requestedLevel === 'comment' && systemRules.view) {
    return 'view';
  }

  return undefined;
}

/**
 * Checks if a role can approve access requests
 */
export function canApproveRequests(role: UserRole): boolean {
  const rules = accessRules as Record<UserRole, RoleRules>;
  const roleRules = rules[role];
  return roleRules?.canApprove === true || roleRules?.finalApprovalAuthority === true;
}

/**
 * Checks if a role has final approval authority
 */
export function hasFinalApprovalAuthority(role: UserRole): boolean {
  const rules = accessRules as Record<UserRole, RoleRules>;
  const roleRules = rules[role];
  return roleRules?.finalApprovalAuthority === true;
}

