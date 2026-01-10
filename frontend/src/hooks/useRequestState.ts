/**
 * useRequestState Hook
 * 
 * Manages request state for the task-driven agent
 * Single source of truth for request state in the frontend
 */

import { useState, useEffect, useCallback } from 'react';
import { RequestState, UserRole } from '../types/access';
import { getRequestState, updateRequestState, resetRequestState as resetStateAPI } from '../services/api';

interface UseRequestStateReturn {
  state: RequestState | null;
  isLoading: boolean;
  updateState: (message: string) => Promise<void>;
  resetState: () => Promise<void>;
  response: string;
  nextAction: string;
}

/**
 * Hook for managing request state
 * 
 * @param userId - The ID of the user
 * @param userRole - The role of the user
 * @returns RequestState management functions and state
 */
export function useRequestState(userId: string, userRole: UserRole): UseRequestStateReturn {
  const [state, setState] = useState<RequestState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [response, setResponse] = useState('');
  const [nextAction, setNextAction] = useState('');

  // Load initial state
  useEffect(() => {
    // Guard against invalid userId values
    if (!userId || userId === 'reset' || typeof userId !== 'string' || userId.trim() === '') {
      console.warn('Invalid userId provided to useRequestState:', userId);
      setIsLoading(false);
      return;
    }

    const loadState = async () => {
      try {
        const currentState = await getRequestState(userId);
        setState(currentState);
        setNextAction(currentState.missingFields.length > 0 
          ? `Need: ${currentState.missingFields[0]}` 
          : 'Ready to submit');
      } catch (error) {
        console.error('Failed to load request state:', error);
        // Initialize empty state if load fails with all required fields
        setState({
          user: userId,
          role: userRole,
          system: undefined,
          accessLevel: undefined,
          project: undefined,
          status: 'DRAFT',
          agentConfidence: 'MEDIUM',
          missingFields: ['system', 'accessLevel']
        });
        setNextAction('Need: system');
      } finally {
        setIsLoading(false);
      }
    };

    loadState();
  }, [userId, userRole]);

  // Update state with user message
  const updateState = useCallback(async (message: string) => {
    // Guard against invalid userId values
    if (!userId || userId === 'reset' || typeof userId !== 'string' || userId.trim() === '') {
      console.warn('Invalid userId provided to updateState:', userId);
      setResponse('Error: Invalid user ID');
      return;
    }

    if (!state) return;

    try {
      setIsLoading(true);
      const result = await updateRequestState(userId, state, message);
      setState(result.newState);
      setResponse(result.response);
      setNextAction(result.nextAction);
    } catch (error) {
      console.error('Failed to update request state:', error);
      setResponse('Error processing request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [userId, state]);

  // Reset state to DRAFT
  const resetState = useCallback(async () => {
    // Guard against invalid userId values
    if (!userId || userId === 'reset' || typeof userId !== 'string' || userId.trim() === '') {
      console.warn('Invalid userId provided to resetState:', userId);
      return;
    }

    try {
      setIsLoading(true);
      const resetState = await resetStateAPI(userId);
      setState(resetState);
      setResponse('');
      setNextAction('Need: system');
    } catch (error) {
      console.error('Failed to reset request state:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  return {
    state,
    isLoading,
    updateState,
    resetState,
    response,
    nextAction
  };
}

