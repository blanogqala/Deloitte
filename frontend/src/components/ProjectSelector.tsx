/**
 * ProjectSelector Component
 * 
 * Allows selection of project for access requests
 * Filters projects based on user assignments (IT Admin sees all)
 */

import React from 'react';
import { Project, UserRole } from '../types/access';

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: string | null;
  userRole: UserRole;
  userProjectIds: string[];
  userId?: string; // User ID to check if they're a manager
  onProjectChange: (projectId: string | null) => void;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  projects,
  selectedProjectId,
  userRole,
  userProjectIds,
  userId,
  onProjectChange
}) => {
  // IT Administrators can see all projects
  // Managers can see projects they manage (based on managerId)
  // For GitHub requests, show ALL projects (assignment validation happens at submission time)
  let availableProjects: Project[];
  
  if (userRole === 'IT Administrator') {
    availableProjects = projects;
  } else if (userRole === 'Manager' && userId) {
    // Managers see projects they manage
    availableProjects = projects.filter(p => p.managerId === userId);
  } else {
    // For GitHub requests, show ALL projects from mock dataset
    // Assignment check happens during validation at submission time, not in UI
    availableProjects = projects;
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-gray-700">
        Project:
      </label>
      <select
        value={selectedProjectId || ''}
        onChange={(e) => onProjectChange(e.target.value || null)}
        className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="">Select a project...</option>
        {availableProjects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      {selectedProjectId && (
        <span className="text-sm text-gray-600">
          {projects.find(p => p.id === selectedProjectId)?.name}
        </span>
      )}
    </div>
  );
};

