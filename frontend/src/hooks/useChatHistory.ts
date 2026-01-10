/**
 * useChatHistory Hook
 * 
 * Manages chat history per user
 * Maintains separate chat history for each user to prevent mixing conversations
 */

import { useState, useCallback } from 'react';
import { ChatMessage } from '../types/access';

interface UseChatHistoryReturn {
  chatHistory: ChatMessage[];
  addMessage: (message: ChatMessage, targetUserId?: string) => void;
  clearChatHistory: () => void;
  getChatHistory: (userId: string) => ChatMessage[];
}

/**
 * Hook for managing chat history per user
 * 
 * @param userId - The ID of the current user
 * @returns Chat history management functions and current user's chat history
 */
export function useChatHistory(userId: string): UseChatHistoryReturn {
  // Maintain chat history map keyed by userId
  // Using a ref-like pattern with state to persist across renders
  const [chatHistoryByUser, setChatHistoryByUser] = useState<Record<string, ChatMessage[]>>({});
  
  // Get current user's chat history
  const chatHistory = chatHistoryByUser[userId] || [];

  // Add a message to a specific user's chat history
  // If targetUserId is provided, add to that user's history; otherwise use hook's userId
  const addMessage = useCallback((message: ChatMessage, targetUserId?: string) => {
    const targetId = targetUserId || userId;
    setChatHistoryByUser(prev => {
      const userHistory = prev[targetId] || [];
      // Prevent duplicate messages by checking ID
      const messageExists = userHistory.some(m => m.id === message.id);
      if (messageExists) {
        return prev;
      }
      return {
        ...prev,
        [targetId]: [...userHistory, message]
      };
    });
  }, [userId]);

  // Clear chat history for current user
  const clearChatHistory = useCallback(() => {
    setChatHistoryByUser(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, [userId]);

  // Get chat history for a specific user (helper function)
  const getChatHistory = useCallback((targetUserId: string): ChatMessage[] => {
    return chatHistoryByUser[targetUserId] || [];
  }, [chatHistoryByUser]);

  return {
    chatHistory,
    addMessage,
    clearChatHistory,
    getChatHistory
  };
}

