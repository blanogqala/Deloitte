/**
 * Approval Routes
 * 
 * Defines REST API endpoints for approval operations
 */

import { Router } from 'express';
import { 
  getPendingApprovals, 
  getPendingApprovalsCountEndpoint,
  approveAccessRequest,
  rejectAccessRequest,
  addChatEvent
} from '../controllers/accessRequest.controller';

const router = Router();

/**
 * GET /api/approvals/pending/:managerId
 * Get pending approvals for a manager
 */
router.get('/pending/:managerId', getPendingApprovals);

/**
 * GET /api/approvals/count/:managerId
 * Get count of pending approvals for a manager
 */
router.get('/count/:managerId', getPendingApprovalsCountEndpoint);

/**
 * POST /api/approvals/approve
 * Approve an access request
 */
router.post('/approve', approveAccessRequest);

/**
 * POST /api/approvals/reject
 * Reject an access request
 */
router.post('/reject', rejectAccessRequest);

/**
 * POST /api/approvals/chat-events
 * Add chat event message (for event-driven chat updates)
 */
router.post('/chat-events', addChatEvent);

export default router;

