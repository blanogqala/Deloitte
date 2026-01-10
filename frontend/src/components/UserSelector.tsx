/**
 * UserSelector Component
 * 
 * Allows selection of mock user identity for the application
 * This is intentionally mocked for assessment purposes - no real authentication
 */

import React from 'react';
import { User } from '../types/access';

interface UserSelectorProps {
  users: User[];
  selectedUserId: string;
  onUserChange: (userId: string) => void;
  pendingApprovalCounts?: Record<string, number>;
}

export const UserSelector: React.FC<UserSelectorProps> = ({
  users,
  selectedUserId,
  onUserChange,
  pendingApprovalCounts = {}
}) => {
  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-gray-700">
        User:
      </label>
      <div className="relative">
        <select
          value={selectedUserId}
          onChange={(e) => onUserChange(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
        >
          {users.map((user) => {
            const count = pendingApprovalCounts[user.id] || 0;
            const displayName = count > 0 
              ? `${user.name} (${user.role}) - ${count} pending`
              : `${user.name} (${user.role})${user.department ? ` - ${user.department}` : ''}`;
            return (
              <option key={user.id} value={user.id}>
                {displayName}
              </option>
            );
          })}
        </select>
        {pendingApprovalCounts[selectedUserId] > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {pendingApprovalCounts[selectedUserId]}
          </span>
        )}
      </div>
      {selectedUser && (
        <span className="text-sm text-gray-600">
          Role: <span className="font-medium">{selectedUser.role}</span>
        </span>
      )}
    </div>
  );
};

