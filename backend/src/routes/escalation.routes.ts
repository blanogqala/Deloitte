/**
 * Escalation Routes
 * 
 * Defines REST API endpoints for escalation operations
 */

import { Router } from 'express';
import { handleEscalationRequest, getEscalation } from '../controllers/accessRequest.controller';

const router = Router();

/**
 * POST /api/escalation
 * Create a new escalation request
 */
router.post('/', handleEscalationRequest);

/**
 * GET /api/escalation/:escalationId
 * Get an escalation request by ID
 */
router.get('/:escalationId', getEscalation);

export default router;

