/**
 * Request State Routes
 * 
 * Defines REST API endpoints for request state operations
 */

import { Router } from 'express';
import { 
  handleRequestStateUpdate, 
  getRequestStateForUser, 
  resetRequestStateForUser 
} from '../controllers/accessRequest.controller';

const router = Router();

/**
 * POST /api/request-state/update
 * Update request state based on user message
 */
router.post('/update', handleRequestStateUpdate);

/**
 * GET /api/request-state/:userId
 * Get current request state for a user
 */
router.get('/:userId', getRequestStateForUser);

/**
 * POST /api/request-state/:userId/reset
 * Reset request state to DRAFT
 */
router.post('/:userId/reset', resetRequestStateForUser);

export default router;

