/**
 * Access Request Routes
 * 
 * Defines REST API endpoints for access request operations
 */

import { Router } from 'express';
import { handleAccessRequest, getAccessRequest } from '../controllers/accessRequest.controller';

const router = Router();

/**
 * POST /api/access-request
 * Create and process a new access request
 */
router.post('/', handleAccessRequest);

/**
 * GET /api/access-request/:requestId
 * Get an access request by ID
 */
router.get('/:requestId', getAccessRequest);

export default router;

