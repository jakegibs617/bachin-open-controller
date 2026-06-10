import { Project } from '../types';

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatProjectFileTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes())
  ].join('-');
}

export function safeProjectFileName(project: Project, savedAt: Date = new Date()): string {
  const baseName = project.name || project.id || 'project';
  const safeName = baseName.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'project';
  return `${safeName}-${formatProjectFileTimestamp(savedAt)}.boc.json`;
}
