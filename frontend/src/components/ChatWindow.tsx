/**
 * ChatWindow Component
 * 
 * State-aware chat interface for task-driven agent
 * Displays task progress and next required actions
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, RequestState } from '../types/access';
import { MessageBubble } from './MessageBubble';

interface ChatWindowProps {
  userId: string;
  onMessageSent: (message: string) => Promise<void>;
  requestState: RequestState | null;
  assistantResponse?: string;
  nextAction?: string;
  isLoading?: boolean;
  chatHistory: ChatMessage[];
  onAddMessage: (message: ChatMessage) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  userId,
  onMessageSent,
  requestState,
  assistantResponse,
  nextAction,
  isLoading: externalLoading,
  chatHistory,
  onAddMessage
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastResponseRef = useRef<string>('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  // Initialize welcome message only if user has no chat history
  useEffect(() => {
    if (requestState && chatHistory.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: `welcome-${userId}-${Date.now()}`,
        text: requestState.missingFields.length > 0
          ? `Which system? (Email, GitHub, or Jira)`
          : 'Ready to submit your request.',
        sender: 'assistant',
        timestamp: new Date()
      };
      onAddMessage(welcomeMessage);
    }
  }, [requestState, userId, chatHistory.length, onAddMessage]);

  // Add assistant response when it arrives (prevent duplicates)
  useEffect(() => {
    if (assistantResponse && assistantResponse.trim() && assistantResponse !== lastResponseRef.current) {
      lastResponseRef.current = assistantResponse;
      // Check if this response already exists in chat history
      const messageExists = chatHistory.some(
        m => m.sender === 'assistant' && m.text === assistantResponse
      );
      if (!messageExists) {
        const assistantMessage: ChatMessage = {
          id: `assistant-${userId}-${Date.now()}`,
          text: assistantResponse,
          sender: 'assistant',
          timestamp: new Date()
        };
        onAddMessage(assistantMessage);
      }
    }
  }, [assistantResponse, userId, chatHistory, onAddMessage]);

  // Update placeholder based on next action
  const getPlaceholder = () => {
    if (!requestState || requestState.missingFields.length === 0) {
      return 'Type your message...';
    }
    const nextField = requestState.missingFields[0];
    const placeholders: Record<string, string> = {
      system: 'e.g., GitHub, Email, or Jira',
      accessLevel: 'e.g., read-only, read-write, or admin',
      project: 'e.g., Alpha or Beta'
    };
    return placeholders[nextField] || 'Type your message...';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || isLoading || externalLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${userId}-${Date.now()}`,
      text: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    // Add user message to chat history
    onAddMessage(userMessage);
    setInputValue('');
    setIsLoading(true);

    try {
      await onMessageSent(inputValue);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: `error-${userId}-${Date.now()}`,
        text: 'Error processing request. Please try again.',
        sender: 'assistant',
        timestamp: new Date()
      };
      onAddMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const isProcessing = isLoading || externalLoading;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Task Progress Indicator */}
      {requestState && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-blue-700 font-medium">
              Status: {requestState.status}
            </span>
            {nextAction && (
              <span className="text-blue-600">
                {nextAction}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {chatHistory.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-400">
              <p className="text-sm">No messages yet</p>
              <p className="text-xs mt-2">Start a conversation to request access</p>
            </div>
          </div>
        ) : (
          <>
            {chatHistory.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </>
        )}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <p className="text-sm text-gray-500">Processing...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={getPlaceholder()}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isProcessing}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isProcessing}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};
