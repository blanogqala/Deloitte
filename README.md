# UI-Constrained Agent: IT Access Request Assistant

A task-focused conversational agent where the UI constrains agent behavior through predefined components, deterministic state management, and strict response formatting. Built for Deloitte's Agentic AI Engineering assessment (Option 1).

## Core Design Philosophy

**UI Constraints Drive Agent Behavior**: Unlike free-form chat interfaces, this system uses structured UI components to guide user interactions and constrain agent responses. The agent never generates free-form text—all responses are rendered through predefined components (selectors, status indicators, buttons) with a strict 120-character message limit.

## Architecture Overview

The system implements a **three-layer state model**:

1. **UI State** (Frontend): React component state, user interactions, visual feedback
2. **Agent State** (Backend): Task-driven state machine (DRAFT → IN_PROGRESS → AWAITING_APPROVAL/APPROVED → REJECTED)
3. **Memory State** (Backend): Persistent request state, approval workflows, chat history

### Key Components

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Express.js + TypeScript + Node.js
- **State Machine**: Deterministic task-driven agent with explicit state transitions
- **AI Layer**: Rule-based intent parsing (mocked LLM) with 120-character response constraint
- **Rule Engine**: RBAC-based access control validation
- **Approval Service**: Unified approval routing with `assignedApproverId` and `fallbackApproverId`

## Project Structure

```
internal-it-access-assistant/
├── frontend/
│   ├── src/
│   │   ├── components/      # Predefined UI components (ProjectSelector, EmployeeSelector, etc.)
│   │   ├── pages/           # Dashboard with constrained chat interface
│   │   ├── hooks/           # State management hooks (useRequestState, useChatHistory)
│   │   ├── services/        # API client
│   │   ├── types/           # TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── routes/          # Express routes
│   │   ├── controllers/     # Request handlers
│   │   ├── services/         # Business logic (state machine, AI agent, rule engine)
│   │   ├── data/            # JSON data files (mock data)
│   │   ├── models/          # TypeScript models
│   │   ├── app.ts
│   │   └── server.ts
│   └── package.json
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm/yarn
- TypeScript knowledge (for development)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The backend will run on `http://localhost:3001`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## Usage

1. Start both backend and frontend servers (in separate terminals)
2. Open `http://localhost:3000` in your browser
3. **Select a user** from the dropdown at the top (Alice, Bob, Sarah, or Michael)
   - Managers and IT Administrators will see a notification badge showing pending approval count
4. **Select a project** (Project Alpha or Project Beta) - appears when GitHub is selected
5. Use the chat interface to request access to Email, GitHub, or Jira
6. View request details in the right panel (synchronized with chat state)
7. **For Managers**: When switching to a manager account with pending approvals, an approval modal will automatically appear

### Example Requests

- "I need read-write access to GitHub for Project Beta"
- "Can I get admin access to Jira for Project Alpha?"
- "I need read-only access to GitHub"
- "I want to view and comment on Jira tickets"
- "Email access to Sarah's account" (employee-owned request)

## UI-Constrained Agent Design

### Response Constraints

**120-Character Limit**: All agent responses are strictly limited to 120 characters. The `truncateMessage()` function enforces this constraint, ensuring concise, actionable responses.

**Predefined UI Components Only**: Agent responses are never rendered as free-form text. Instead, they trigger specific UI components:

- **ProjectSelector**: Appears when GitHub is selected and project is missing
- **EmployeeSelector**: Appears when Email/Jira is selected by Interns and target employee is missing
- **ConfidenceIndicator**: Shows agent confidence level (HIGH/MEDIUM/LOW)
- **StateIndicator**: Shows current request state (DRAFT/IN_PROGRESS/AWAITING_APPROVAL/APPROVED/REJECTED)
- **RequestSummary**: Displays structured request details in right panel
- **ApprovalModal**: Shows pending approvals for managers
- **NextActionPrompt**: Displays next required action

### State Model: UI vs Agent vs Memory

#### UI State (Frontend)
- **Location**: React component state (`useState`, `useRequestState` hook)
- **Purpose**: Manages user interactions, component visibility, visual feedback
- **Scope**: Per-component, ephemeral
- **Example**: `isProjectSelectorVisible`, `selectedProject`, `chatHistory`

#### Agent State (Backend)
- **Location**: `RequestState` interface, managed by `requestState.service.ts`
- **Purpose**: Task-driven state machine tracking conversation progress
- **States**: `DRAFT → IN_PROGRESS → AWAITING_APPROVAL/APPROVED → REJECTED`
- **Scope**: Per-user, session-based
- **Example**: `{ status: 'IN_PROGRESS', system: 'GitHub', missingFields: ['project'] }`

#### Memory State (Backend)
- **Location**: In-memory Maps (`accessRequests`, `requestStates`)
- **Purpose**: Persistent request data, approval workflows, audit trail
- **Scope**: Global, persists until server restart
- **Example**: `AccessRequest` objects with approval history, timestamps

**State Synchronization**: The frontend `useRequestState` hook maintains bidirectional sync between UI state and agent state via `/api/request-state/update` endpoint.

### Task-Driven State Machine

The agent follows a deterministic state machine:

```
DRAFT
  ↓ (user selects system)
IN_PROGRESS
  ↓ (all required fields provided)
AWAITING_APPROVAL (if requiresApproval === true)
  OR
APPROVED (if requiresApproval === false, auto-approved)
  ↓ (if rejected)
REJECTED
```

**State Transitions**:
- **DRAFT → IN_PROGRESS**: Triggered when user selects a system
- **IN_PROGRESS → AWAITING_APPROVAL**: Auto-transitions when all required fields are complete and `requiresApproval === true`
- **IN_PROGRESS → APPROVED**: Auto-transitions when all required fields are complete and `requiresApproval === false` (auto-approval)
- **AWAITING_APPROVAL → APPROVED**: Manager/IT Admin approves
- **AWAITING_APPROVAL → REJECTED**: Manager/IT Admin rejects

**Partial Task Completion**: The system maintains state even when fields are missing. Users can:
- Provide information incrementally
- See current state in Request Details panel
- See "Awaiting input" badges for missing fields
- Continue conversation without losing progress

### User Correction Without Restarting

The system supports corrections through **state-aware intent parsing**:

1. **Correction Detection**: `parseIntentFromMessage()` extracts only NEW information, allowing users to correct previous answers
2. **State Preservation**: Existing state fields are preserved unless explicitly changed
3. **Example**: User says "GitHub" then later "actually, make it Jira" - system updates `system` field while preserving other fields

**Implementation**:
```typescript
// Backend: parseIntentFromMessage() only extracts fields not already in state
// Frontend: State updates are incremental, not destructive
// UI: Request Details panel shows current state, allowing users to see what needs correction
```

### Agent Confidence Indicator

The system displays agent confidence levels:

- **HIGH**: Standard requests (e.g., Intern requesting read-only GitHub access)
- **MEDIUM**: Typical requests requiring approval
- **LOW**: High-risk requests (e.g., Intern requesting admin access)

**Confidence Calculation** (`calculateConfidence()`):
- Based on role, requested access level, and system
- Intern + admin = LOW confidence
- Intern + read-only = HIGH confidence
- Others = MEDIUM confidence

**UI Display**: `ConfidenceIndicator` component shows confidence as colored badge in Request Details panel.

## Failure Scenario and Recovery

### Scenario: User Requests Invalid Access Level

**Failure**: Intern requests "admin" access to Email (not permitted by RBAC rules)

**System Behavior**:
1. User types "admin" in chat
2. State updates: `accessLevel: 'admin'`, `agentConfidence: 'LOW'`
3. System validates against RBAC: `validateAccessRequest()` returns `isValid: false`
4. **Recovery**: System does NOT auto-reject. Instead:
   - State remains `IN_PROGRESS`
   - Agent asks: "Admin requires approval. Choose read-only or read-write?"
   - Request Details panel shows "Awaiting input" for accessLevel
   - User can correct by providing valid access level
   - System recovers without losing conversation context

**Recovery Mechanism**:
- Validation errors throw exceptions that prevent auto-submission
- State remains in `IN_PROGRESS` (not `REJECTED`)
- Agent generates clarification question (≤120 chars)
- User can provide correction without restarting

**Code Flow**:
```typescript
// stateTransition.service.ts: transitionToAwaitingApproval()
if (!validationResult.isValid) {
  throw new Error(...); // Prevents auto-submission, state remains IN_PROGRESS
}

// aiAgent.service.ts: generateStateAwareResponse()
if (state.agentConfidence === 'LOW' && state.role === 'Intern' && state.accessLevel === 'admin') {
  return "Admin requires approval. Choose read-only or read-write?";
}
```

## What Would Break with Plain Text Chat

If this system were implemented as a plain text chat interface, several critical features would break:

### 1. **State Management Breakdown**
- **Current**: UI components maintain state, Request Details panel shows structured data
- **Plain Text**: No visual state representation, users must remember conversation context
- **Impact**: Users would lose track of partial completions, leading to repeated questions

### 2. **120-Character Constraint Unenforceable**
- **Current**: `truncateMessage()` enforces limit, UI components handle display
- **Plain Text**: No way to enforce character limit, responses could be verbose
- **Impact**: Violates requirement, reduces clarity, increases cognitive load

### 3. **No Visual Confidence Indicator**
- **Current**: `ConfidenceIndicator` component shows HIGH/MEDIUM/LOW badges
- **Plain Text**: Would need to embed confidence in text ("⚠️ Low confidence: Admin access...")
- **Impact**: Less intuitive, harder to scan, violates UI constraint requirement

### 4. **Correction Flow Confusion**
- **Current**: Request Details panel shows current state, users see what needs correction
- **Plain Text**: Users must remember what they've already provided
- **Impact**: Higher error rate, more back-and-forth, frustration

### 5. **Project/Employee Selection Ambiguity**
- **Current**: `ProjectSelector` and `EmployeeSelector` provide constrained choices
- **Plain Text**: Users could type invalid project names or employee names
- **Impact**: More validation errors, unclear error messages, poor UX

### 6. **Approval Workflow Breakdown**
- **Current**: Approval modal shows structured request details, approval buttons
- **Plain Text**: Would need to parse text to understand request context
- **Impact**: Managers couldn't efficiently review requests, approval workflow breaks

### 7. **No Real-Time State Synchronization**
- **Current**: Request Details panel updates in real-time as user provides information
- **Plain Text**: No visual feedback of current state
- **Impact**: Users don't know what's missing, can't see progress

## Employee-Owned Access Requests

The system supports **employee-owned access requests** for Email and Jira systems:

### Flow for Interns Requesting Employee Account Access

1. **User selects Email or Jira**: System detects Intern role
2. **EmployeeSelector appears**: UI component shows list of employees (excluding current user)
3. **User selects target employee**: `targetEmployeeId` is set in state
4. **System routes to account owner**: Request is routed to `assignedApproverId = targetEmployeeId`
5. **Account owner approves/rejects**: Employee receives notification and can approve/reject
6. **Requester notified**: Original requester sees approval/rejection in chat

**Key Features**:
- Employee-owned requests **always require approval** (even if RBAC says otherwise)
- Approval routed directly to account owner (`assignedApproverId`)
- IT Admin can override (`fallbackApproverId = 'admin-001'`)
- When IT Admin approves, original account owner receives read-only notification

## Auto-Approval Logic

The system implements **intelligent auto-approval** based on role and access level:

### Auto-Approval Scenarios

1. **IT Administrators**: All requests auto-approve (Jira admin, GitHub admin, Email default)
2. **Managers**: Jira admin auto-approves (per `accessRules.json`)
3. **Developers**: GitHub read-write auto-approves, Jira create-edit auto-approves
4. **Interns**: Email default auto-approves (but employee-owned requests always require approval)

### Implementation

```typescript
// stateTransition.service.ts
if (!finalRequiresApproval) {
  // Generate access link
  const accessLink = generateAccessLink(...);
  // Set state to APPROVED immediately
  return updateRequestState(state, {
    status: 'APPROVED',
    accessLink: accessLink,
    approvedAt: new Date().toISOString()
  });
}
```

**UI Feedback**: When auto-approved, chat shows "Request approved. Access granted immediately." and Request Details panel shows APPROVED status with access link.

## Unified Approval Routing

The system uses a **unified approval routing model**:

- **assignedApproverId**: Primary approver (project manager for GitHub, account owner for Email/Jira)
- **fallbackApproverId**: IT Admin (`'admin-001'`) for escalation
- **Filtering**: Managers only see requests where `assignedApproverId === managerId`
- **IT Admin Override**: IT Admins see all requests (override authority)

**Notification Flow**:
- Initial notification → `assignedApproverId`
- If IT Admin approves → Both requester AND original `assignedApproverId` notified
- Original resource owner receives read-only notification when IT Admin overrides

## Mock Identity Context

**Design Decision**: Identity is intentionally mocked for this assessment. This is not a limitation but a deliberate architectural choice.

- **User Selector**: Visible dropdown at the top of the UI allows switching between mock users
- **No Authentication**: No login or password system - users are selected from a dropdown
- **Mock Users**:
  - **Alice** (Intern - Engineering) - Assigned to Project Beta
  - **Bob** (Manager - Project Alpha) - Manages Project Alpha
  - **Sarah** (Manager - Project Beta) - Manages Project Beta
  - **Michael** (IT Administrator) - Full access to all projects

This approach allows evaluators to test different user roles and project assignments without implementing a full authentication system, focusing assessment on access control logic rather than auth infrastructure.

## Project-Level Authorization

The system enforces **project-level authorization** before applying RBAC rules:

1. **Project Assignment Check**: Users must be assigned to a project before accessing project resources
2. **IT Admin Exception**: IT Administrators bypass project restrictions (have access to all projects)
3. **Escalation Path**: If a user requests access to an unassigned project, the system offers escalation to the project manager

### Projects

- **Project Alpha**: Managed by Bob (manager-001)
- **Project Beta**: Managed by Sarah (manager-002)

### Project Assignments

- **Intern (Alice)**: Assigned only to Project Beta
- **Managers**: Assigned to their respective projects
- **IT Admin**: Assigned to all projects

## Approval Workflow

### Request Submission and Approval Flow

1. **User Submits Request**: User completes the task-driven agent flow, providing system, access level, and project (if required)
2. **Auto-Submission**: When all required fields are complete, the request automatically transitions to `AWAITING_APPROVAL` or `APPROVED` status
3. **Approval Required**: Requests requiring approval are routed to the appropriate manager or IT Administrator via `assignedApproverId`
4. **Manager Notification**: 
   - Managers see a notification badge on their user dropdown showing the count of pending approvals
   - When a manager switches to their account, an approval modal automatically appears if there are pending approvals
5. **Approval Modal**: Managers can review pending requests with full details:
   - Requester name and role
   - System and access level requested
   - Project (if applicable)
   - Target employee (if employee-owned request)
   - Request reason (if provided)
   - Request timestamp
6. **Approval/Rejection**: Managers can approve or reject requests
   - Rejection requires a reason (max 120 characters)
   - Decisions are immediately processed and reflected in the system
7. **Real-time Updates**: Approval counts update automatically every 5 seconds

### Manager Project Visibility

- **Managers** see projects they **manage** (based on `managerId` in projects.json)
- **Other users** see projects they're **assigned to** (based on projectAssignments.json)
- **IT Administrators** see **all projects**

## Escalation Flow

When a user requests access to a project they are not assigned to:

1. **Denial**: System denies direct access
2. **Explanation**: AI explains why access is denied and identifies the project manager (≤120 chars)
3. **Escalation Offer**: System offers to escalate the request to the project manager
4. **Manager Decision**: Manager reviews and approves/rejects with justification (≤120 chars)
5. **Notification**: User receives the manager's decision

**Note**: Escalation requests also appear in the manager's approval modal for review.

## Access Control Rules

### Roles

- **Intern**: Limited access, requires manager approval for most systems
- **Developer**: Standard access, admin requires approval
- **Manager**: Can approve requests, Jira admin access (auto-approved)
- **IT Administrator**: Full access, final approval authority, all requests auto-approved

### Systems

- **Email**: Default access for all roles (employee-owned requests require account owner approval)
- **GitHub**: Role-based read/write/admin permissions
- **Jira**: Role-based view/comment/create-edit/admin permissions

## Security Principles

1. **Rule Engine is Authoritative**: All access decisions go through the rule engine. The AI layer never overrides RBAC rules or project restrictions.
2. **AI Provides Explanations Only**: The AI agent parses intent, asks clarifying questions, and explains decisions, but cannot grant access or override project assignments.
3. **Project Assignment Check First**: Project-level authorization is checked BEFORE RBAC rules. Users must be assigned to a project before access is considered.
4. **Escalation Requires Confirmation**: Escalation requests require explicit user confirmation - the system never auto-escalates.
5. **Approval Workflow Enforced**: Approval requirements are enforced at the service layer.
6. **Type Safety**: TypeScript ensures type safety throughout the system.
7. **Auditable Decisions**: All access decisions, escalations, and manager responses are traceable through request IDs.
8. **Auto-Approval Based on Role**: IT Administrators and authorized roles receive immediate approval without manual intervention.

## API Endpoints

### POST `/api/request-state/update`

**Primary endpoint for task-driven agent interactions.**

Updates request state based on user message. Supports partial updates and corrections.

**Request Body:**
```json
{
  "userId": "intern-001",
  "currentState": {
    "user": "intern-001",
    "role": "Intern",
    "system": "GitHub",
    "status": "IN_PROGRESS",
    "missingFields": ["project"]
  },
  "message": "Project Beta"
}
```

**Response:**
```json
{
  "newState": {
    "user": "intern-001",
    "role": "Intern",
    "system": "GitHub",
    "project": "Project Beta",
    "status": "AWAITING_APPROVAL",
    "missingFields": []
  },
  "response": "Request submitted: read-only access to GitHub. Awaiting approval from Sarah (Project Owner).",
  "nextAction": "Need: approval",
  "reasoning": "Your role (Intern) allows this access, but approval required from Sarah."
}
```

### POST `/api/access-request`

Legacy endpoint for direct access request submission.

### GET `/api/approvals/pending/:managerId`

Get pending approvals for a manager (filtered by `assignedApproverId`).

### POST `/api/approvals/approve`

Approve an access request.

**Request Body:**
```json
{
  "requestId": "req-1234567890-abc123",
  "approverId": "manager-001"
}
```

### POST `/api/approvals/reject`

Reject an access request.

**Request Body:**
```json
{
  "requestId": "req-1234567890-abc123",
  "approverId": "manager-001",
  "reason": "Access level too high for intern role"
}
```

## Development Notes

- **Mock Identity**: Identity is intentionally mocked - users are selected from a dropdown. This is a design decision, not a limitation.
- **Mock AI**: The AI layer is mocked for demonstration purposes - uses rule-based intent parsing rather than actual LLM calls
- **In-Memory Storage**: Data is stored in-memory (resets on server restart)
- **No Real Authentication**: No login/password system - this is intentional for assessment focus
- **Assessment Purpose**: The system is designed to demonstrate UI-constrained agent design, state management, and recovery behavior

## Assessment Highlights

This implementation demonstrates:

- ✅ **UI-Constrained Agent Design**: All responses rendered via predefined components, 120-character limit enforced
- ✅ **Task-Driven Stateful Agent**: Deterministic state machine with explicit transitions
- ✅ **Partial Task Completion**: State preserved across conversation, users can provide information incrementally
- ✅ **User Correction Without Restart**: State-aware intent parsing allows corrections without losing context
- ✅ **Visible Agent Confidence**: ConfidenceIndicator component shows HIGH/MEDIUM/LOW confidence levels
- ✅ **Three-Layer State Model**: Clear separation between UI state, agent state, and memory state
- ✅ **Failure Recovery**: Validation errors prevent auto-submission, system recovers gracefully
- ✅ **Rule-based access control** reasoning with project-level authorization
- ✅ **Employee-owned access requests** with unified approval routing
- ✅ **Auto-approval logic** for authorized roles
- ✅ **Real-time state synchronization** between chat and Request Details panel
- ✅ **Professional engineering discipline** (TypeScript, structured code, comprehensive comments)
- ✅ **Clear architecture and maintainability**

## License

This is an assessment project for Deloitte's Agentic AI Engineering team.
