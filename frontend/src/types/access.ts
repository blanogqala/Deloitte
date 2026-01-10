/**
 * Frontend Type Definitions
 * 
 * Type-safe interfaces for access request system
 * These mirror the backend types for consistency
 */

export type UserRole = 'Intern' | 'Developer' | 'Manager' | 'IT Administrator';

export type SystemName = 'Email' | 'GitHub' | 'Jira';

export type AccessLevel = 
  | 'read-only' 
  | 'read-write' 
  | 'admin' 
  | 'view' 
  | 'comment' 
  | 'create-edit' 
  | 'default';

export type RequestStatus = 'approved' | 'pending' | 'rejected';

// Task-driven agent state types
export type TaskRequestStatus = 'DRAFT' | 'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED';
export type AgentConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RequestState {
  user: string;              // userId
  role: UserRole;
  system?: SystemName;       // Email | GitHub | Jira
  accessLevel?: AccessLevel; // read-only | read-write | admin
  project?: string;          // Required only for GitHub
  targetEmployeeId?: string; // Required for Email/Jira employee-owned requests
  status: TaskRequestStatus;
  agentConfidence: AgentConfidence;
  missingFields: string[];   // Derived field
  accessLink?: string;       // Generated access link for approved requests
  rejectionReason?: string;  // Rejection reason for rejected requests
  approverId?: string;       // ID of the approver
  approverRole?: UserRole;   // Role of the approver
  approvedAt?: string;       // ISO timestamp when approved
  rejectedAt?: string;       // ISO timestamp when rejected
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
}

export interface Project {
  id: string;
  name: string;
  managerId: string;
}

export interface AccessRequest {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  system: SystemName;
  accessLevel: AccessLevel;
  project?: string;
  projectId?: string;
  projectOwnerManagerId?: string; // The managerId who owns the project (kept for backward compatibility)
  targetEmployeeId?: string; // The employee whose account access is requested (for Email/Jira)
  employeeOwnerId?: string; // Same as targetEmployeeId, used for approval routing (kept for backward compatibility)
  assignedApproverId?: string; // The primary approver (resource owner: project manager or employee)
  fallbackApproverId?: string; // IT Admin ID for escalation (always 'admin-001')
  reason?: string;
  status: RequestStatus;
  requiresApproval: boolean;
  requiresEscalation?: boolean;
  escalationTo?: string;
  approvalBy?: string;
  approverId?: string; // ID of the approver
  approverRole?: UserRole; // Role of the approver
  approvedAt?: string; // ISO timestamp when approved
  rejectedAt?: string; // ISO timestamp when rejected
  rejectionReason?: string;
  escalationJustification?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccessRequestResponse {
  requestId: string | null;
  status: RequestStatus;
  message: string;
  reasoning?: string;
  requiresApproval: boolean;
  requiresEscalation?: boolean;
  escalationTo?: string;
  approvalBy?: string;
  rejectionReason?: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
}

export interface EscalationRequest {
  id: string;
  userId: string;
  projectId: string;
  system: SystemName;
  accessLevel: AccessLevel;
  status: RequestStatus;
  escalationTo: string;
  justification?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  requestId?: string | null;
  status?: RequestStatus;
}

export interface PendingApprovalsResponse {
  pendingApprovals: AccessRequest[];
  count: number;
}

export interface ApprovalCountResponse {
  count: number;
}

export interface ApproveRequestBody {
  requestId: string;
  approverId: string;
}

export interface RejectRequestBody {
  requestId: string;
  approverId: string;
  reason: string;
}

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
  accessLink?: string;
  rejectionReason?: string;
}

export interface ApprovalResponse {
  success: boolean;
  request: AccessRequest;
  event: ApprovalEvent;
  message: string;
}

