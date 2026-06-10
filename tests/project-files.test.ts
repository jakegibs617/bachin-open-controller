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

  it('formats project save timestamps as year month day hour minute', () => {
    expect(formatProjectFileTimestamp(new Date(2026, 5, 10, 9, 7, 30))).toBe('2026-06-10-09-07');
  });

  it('includes the save timestamp in default project filenames', () => {
    expect(safeProjectFileName(project, new Date(2026, 5, 10, 14, 15))).toBe(
      'fathers-day-card-2026-black.png-2026-06-10-14-15.boc.json'
    );
  });

  it('sanitizes project names before adding the save timestamp', () => {
    expect(safeProjectFileName({ ...project, name: 'Father Day / Card!' }, new Date(2026, 0, 2, 3, 4))).toBe(
      'Father-Day-Card-2026-01-02-03-04.boc.json'
    );
  });
});
