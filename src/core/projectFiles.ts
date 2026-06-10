import { Project } from '../types';

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatProjectFileTimestamp(date: Date): string {
  return [
    date.getUTCFullYear(),
    padDatePart(date.getUTCMonth() + 1),
    padDatePart(date.getUTCDate()),
    padDatePart(date.getUTCHours()),
    padDatePart(date.getUTCMinutes())
  ].join('-');
}

export function safeProjectFileName(project: Project, savedAt: Date = new Date()): string {
  const baseName = project.name || project.id || 'project';
  const safeName = baseName.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'project';
  return `${safeName}-${formatProjectFileTimestamp(savedAt)}.boc.json`;
}
