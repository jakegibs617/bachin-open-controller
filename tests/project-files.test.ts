import { formatProjectFileTimestamp, safeProjectFileName } from '../src/core/projectFiles';
import { Project } from '../src/types';

describe('Project file helpers', () => {
  const project: Project = {
    id: 'project-1',
    name: 'fathers-day-card-2026-black.png',
    created: '2026-06-01T10:00:00.000Z',
    machineProfileId: 'ta4',
    units: 'cm',
    canvas: {
      width: 190,
      height: 280,
      offsetX: 0,
      offsetY: 0
    },
    objects: [],
    savedAt: '2026-06-10T14:15:16.000Z'
  };

  it('formats project save timestamps as UTC year month day hour minute', () => {
    expect(formatProjectFileTimestamp(new Date('2026-06-11T04:07:30.000Z'))).toBe('2026-06-11-04-07');
  });

  it('includes the save timestamp in default project filenames', () => {
    expect(safeProjectFileName(project, new Date('2026-06-10T14:15:00.000Z'))).toBe(
      'fathers-day-card-2026-black.png-2026-06-10-14-15.boc.json'
    );
  });

  it('sanitizes project names before adding the save timestamp', () => {
    expect(safeProjectFileName({ ...project, name: 'Father Day / Card!' }, new Date('2026-01-02T03:04:00.000Z'))).toBe(
      'Father-Day-Card-2026-01-02-03-04.boc.json'
    );
  });
});
