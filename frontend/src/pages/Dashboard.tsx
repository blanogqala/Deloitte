/**
 * Dashboard Page
 * 
 * Main page with chat interface and request summary panel
 * Uses stateful task-driven agent with requestState as single source of truth
 */

import React, { useState, useEffect, useCallback } from "react";

import { ChatWindow } from '../components/ChatWindow';
import { RequestSummary } from '../components/RequestSummary';
import { UserSelector } from '../components/UserSelector';
import { ProjectSelector } from '../components/ProjectSelector';
import { EmployeeSelector } from '../components/EmployeeSelector';
import { ApprovalModal } from '../components/ApprovalModal';
import { useRequestState } from '../hooks/useRequestState';
import { useChatHistory } from '../hooks/useChatHistory';
import { User, Project, AccessRequest, ChatMessage } from '../types/access';
import { getPendingApprovals, getPendingApprovalsCount } from '../services/api';

// Mock users data (matches backend)
const MOCK_USERS: User[] = [
  { id: 'intern-001', name: 'Alice', email: 'alice@company.com', role: 'Intern', department: 'Engineering' },
  { id: 'manager-001', name: 'Bob', email: 'bob@company.com', role: 'Manager', department: 'Project Alpha' },
  { id: 'manager-002', name: 'Sarah', email: 'sarah@company.com', role: 'Manager', department: 'Project Beta' },
  { id: 'admin-001', name: 'Michael', email: 'michael@company.com', role: 'IT Administrator', department: 'IT' }
];

// Mock projects data (matches backend)
const MOCK_PROJECTS: Project[] = [
  { id: 'project-1', name: 'Project Alpha', managerId: 'manager-001' },
  { id: 'project-2', name: 'Project Beta', managerId: 'manager-002' }
];

// Mock project assignments (matches backend)
const PROJECT_ASSIGNMENTS: Record<string, string[]> = {
  'intern-001': ['project-2'],
  'manager-001': ['project-1'],
  'manager-002': ['project-2'],
  'admin-001': ['project-1', 'project-2']
};

interface DashboardProps {
  initialUserId?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ initialUserId }) => {
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId || 'intern-001');
  const selectedUser = MOCK_USERS.find(u => u.id === selectedUserId) || MOCK_USERS[0];
  const userProjectIds = PROJECT_ASSIGNMENTS[selectedUserId] || [];
  
  // Approval modal state
  const [pendingApprovals, setPendingApprovals] = useState<AccessRequest[]>([]);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [pendingApprovalCounts, setPendingApprovalCounts] = useState<Record<string, number>>({});

  // Use requestState hook for stateful task-driven agent
  const { state, isLoading, updateState, resetState, response, nextAction } = useRequestState(
    selectedUserId,
    selectedUser.role
  );

  // Use chat history hook for user-scoped chat history
  // We use a dummy userId since we need access to addMessage for any user
  const { chatHistory, addMessage: addMessageToChat } = useChatHistory(selectedUserId);
  
  // Wrapper function for ChatWindow - adds messages to current selected user's chat history
  const handleAddMessage = useCallback((message: ChatMessage) => {
    // Add to current user's chat history (selectedUserId from hook)
    addMessageToChat(message);
  }, [addMessageToChat]);
  
  // Helper function to add messages to any user's chat history (for approval events)
  const addChatMessage = useCallback((targetUserId: string, messageText: string, sender: 'user' | 'assistant' | 'system' = 'system') => {
    const message: ChatMessage = {
      id: `event-${targetUserId}-${Date.now()}`,
      text: messageText,
      sender: sender === 'system' ? 'assistant' : sender,
      timestamp: new Date()
    };
    addMessageToChat(message, targetUserId);
  }, [addMessageToChat]);

  // Reset state when user changes
  useEffect(() => {
    resetState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  // Fetch pending approval counts for all users (managers, IT admins, and employees for employee-owned requests)
  useEffect(() => {
    const fetchApprovalCounts = async () => {
      const counts: Record<string, number> = {};
      for (const user of MOCK_USERS) {
        // Fetch for managers, IT Administrators, and any user who might have employee-owned requests
        // Validate userId before making API call
        if (!user.id || typeof user.id !== 'string' || user.id.trim() === '') {
          console.warn(`Invalid userId for approval count fetch: ${user.id}`);
          counts[user.id] = 0;
          continue;
        }

        try {
          const count = await getPendingApprovalsCount(user.id);
          counts[user.id] = count;
        } catch (error) {
          console.error(`Failed to fetch approval count for ${user.id}:`, error);
          counts[user.id] = 0;
        }
      }
      setPendingApprovalCounts(counts);
    };
    fetchApprovalCounts();
    // Refresh counts every 5 seconds
    const interval = setInterval(fetchApprovalCounts, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch pending approvals when user is selected (managers, IT admins, or employees with employee-owned requests)
  useEffect(() => {
    const fetchPendingApprovals = async () => {
      // Fetch for managers, IT Administrators, and any user (for employee-owned requests)
      // Validate userId before making API call
      if (!selectedUserId || typeof selectedUserId !== 'string' || selectedUserId.trim() === '') {
        console.warn('Invalid selectedUserId for pending approvals fetch:', selectedUserId);
        setPendingApprovals([]);
        setIsApprovalModalOpen(false);
        return;
      }

      try {
        const data = await getPendingApprovals(selectedUserId);
        setPendingApprovals(data.pendingApprovals);
        // Auto-open modal if there are pending approvals
        if (data.pendingApprovals.length > 0) {
          setIsApprovalModalOpen(true);
        }
      } catch (error) {
        console.error('Failed to fetch pending approvals:', error);
        setPendingApprovals([]);
      }
    };
    fetchPendingApprovals();
  }, [selectedUserId, selectedUser.role]);

  // Refresh approvals after approval/rejection
  const handleApprovalUpdate = async () => {
    // Refresh pending approvals for current user
    // Validate userId before making API call
    if (selectedUserId && typeof selectedUserId === 'string' && selectedUserId.trim() !== '') {
      try {
        const data = await getPendingApprovals(selectedUserId);
        setPendingApprovals(data.pendingApprovals);
        // Update counts
        const count = await getPendingApprovalsCount(selectedUserId);
        setPendingApprovalCounts(prev => ({
          ...prev,
          [selectedUserId]: count
        }));
        // Close modal if no more pending approvals
        if (data.pendingApprovals.length === 0) {
          setIsApprovalModalOpen(false);
        }
      } catch (error) {
        console.error('Failed to refresh approvals:', error);
      }
    }
    
    // Refresh all counts (for all users, including employees with employee-owned requests)
    const counts: Record<string, number> = {};
    for (const user of MOCK_USERS) {
      // Validate userId before making API call
      if (!user.id || typeof user.id !== 'string' || user.id.trim() === '') {
        console.warn(`Invalid userId for approval count refresh: ${user.id}`);
        counts[user.id] = 0;
        continue;
      }

      try {
        const count = await getPendingApprovalsCount(user.id);
        counts[user.id] = count;
      } catch (error) {
        counts[user.id] = 0;
      }
    }
    setPendingApprovalCounts(counts);
  };

  // Get selected project from state
  const selectedProject = state?.project 
    ? MOCK_PROJECTS.find(p => p.name === state.project)
    : null;

  // Get selected employee from state
  const selectedEmployee = state?.targetEmployeeId
    ? MOCK_USERS.find(u => u.id === state.targetEmployeeId)
    : null;

  // Determine if employee selector should be shown
  const showEmployeeSelector = state && 
    (state.system === 'Email' || state.system === 'Jira') &&
    state.role === 'Intern' &&
    !state.targetEmployeeId;

  const handleMessageSent = async (message: string) => {
    await updateState(message);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header with User and Project Selectors */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              IT Access Request Assistant
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Task-driven agent for access requests
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <UserSelector
            users={MOCK_USERS}
            selectedUserId={selectedUserId}
            onUserChange={setSelectedUserId}
            pendingApprovalCounts={pendingApprovalCounts}
          />
          {state && state.system === 'GitHub' && (
            <ProjectSelector
              projects={MOCK_PROJECTS}
              selectedProjectId={selectedProject?.id || null}
              userRole={selectedUser.role}
              userProjectIds={userProjectIds}
              userId={selectedUserId}
              onProjectChange={(projectId) => {
                // Project selection updates state via message
                const project = MOCK_PROJECTS.find(p => p.id === projectId);
                if (project) {
                  updateState(`project ${project.name === 'Project Alpha' ? 'alpha' : 'beta'}`);
                }
              }}
            />
          )}
          {showEmployeeSelector && (
            <EmployeeSelector
              employees={MOCK_USERS}
              selectedEmployeeId={selectedEmployee?.id || null}
              currentUserId={selectedUserId}
              onEmployeeChange={(employeeId) => {
                // Employee selection updates state via message
                const employee = MOCK_USERS.find(e => e.id === employeeId);
                if (employee) {
                  updateState(`employee ${employee.name.toLowerCase()}`);
                }
              }}
            />
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Chat Interface (60%) */}
        <div className="w-[60%] border-r border-gray-200">
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden">
              <ChatWindow
                userId={selectedUserId}
                onMessageSent={handleMessageSent}
                requestState={state}
                assistantResponse={response}
                nextAction={nextAction}
                isLoading={isLoading}
                chatHistory={chatHistory}
                onAddMessage={handleAddMessage}
              />
            </div>
          </div>
        </div>

        {/* Right Panel - Request Summary (40%) */}
        <div className="w-[40%] bg-white">
          <div className="h-full flex flex-col">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Request Details
              </h2>
            </div>
            <div className="flex-1 overflow-hidden">
              <RequestSummary 
                requestState={state}
                nextAction={nextAction}
                onResubmit={state?.status === 'REJECTED' ? resetState : undefined}
                employees={MOCK_USERS}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Approval Modal */}
      <ApprovalModal
        isOpen={isApprovalModalOpen}
        onClose={() => setIsApprovalModalOpen(false)}
        pendingApprovals={pendingApprovals}
        approverId={selectedUserId}
        onApprovalUpdate={handleApprovalUpdate}
        onAddChatMessage={addChatMessage}
        employees={MOCK_USERS}
      />
    </div>
  );
};
