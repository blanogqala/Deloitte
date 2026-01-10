/**
 * EmployeeSelector Component
 * 
 * Allows selection of employee for employee-owned access requests (Email/Jira)
 * Shows all employees except the requester themselves
 */

import React from 'react';
import { User } from '../types/access';

interface EmployeeSelectorProps {
  employees: User[];
  selectedEmployeeId: string | null;
  currentUserId: string; // ID of the user making the request (to exclude from list)
  onEmployeeChange: (employeeId: string | null) => void;
}

export const EmployeeSelector: React.FC<EmployeeSelectorProps> = ({
  employees,
  selectedEmployeeId,
  currentUserId,
  onEmployeeChange
}) => {
  // Filter out the current user (can't request access to own account)
  const availableEmployees = employees.filter(emp => emp.id !== currentUserId);

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-gray-700">
        Employee:
      </label>
      <select
        value={selectedEmployeeId || ''}
        onChange={(e) => onEmployeeChange(e.target.value || null)}
        className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="">Select an employee...</option>
        {availableEmployees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name} ({employee.role}){employee.department ? ` - ${employee.department}` : ''}
          </option>
        ))}
      </select>
      {selectedEmployeeId && (
        <span className="text-sm text-gray-600">
          {employees.find(e => e.id === selectedEmployeeId)?.name}
        </span>
      )}
    </div>
  );
};

