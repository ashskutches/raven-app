import { describe, expect, it } from 'vitest';

import { groupIntoLanes, type Task } from './WorkScreen';

/* Only the fields the grouping reads matter; the rest is filler so the shape
   stays honest to what /tasks returns. */
function task(id: string, state: Task['state']): Task {
  return {
    id,
    title: id,
    state,
    outcome: null,
    notes: null,
    next_action: null,
    owner: 'raven',
    arena_id: null,
    blocked_on: null,
    run_count: 0,
    max_runs: 3,
    last_progress: null,
    priority: 0,
    created_at: '2026-09-09T00:00:00.000Z',
  };
}

describe('groupIntoLanes', () => {
  it('puts what she is stopped on first, then what is moving, then what is queued', () => {
    const lanes = groupIntoLanes([
      task('a', 'next'),
      task('b', 'blocked'),
      task('c', 'doing'),
      task('d', 'waiting'),
      task('e', 'inbox'),
    ]);

    expect(lanes.map(l => l.id)).toEqual(['needs-you', 'running', 'queued']);
    expect(lanes[0].tasks.map(t => t.id)).toEqual(['b', 'd']);
    expect(lanes[1].tasks.map(t => t.id)).toEqual(['c']);
    expect(lanes[2].tasks.map(t => t.id)).toEqual(['a', 'e']);
  });

  it('flags only the lane that is a request rather than a status', () => {
    const lanes = groupIntoLanes([task('a', 'waiting'), task('b', 'doing')]);
    expect(lanes.filter(l => l.attention).map(l => l.id)).toEqual(['needs-you']);
  });

  it('drops empty lanes instead of rendering an empty header', () => {
    const lanes = groupIntoLanes([task('a', 'doing')]);
    expect(lanes.map(l => l.id)).toEqual(['running']);
  });

  it('keeps a task whose state no lane names — losing it off the board is worse', () => {
    const lanes = groupIntoLanes([task('a', 'doing'), task('b', 'dropped')]);
    expect(lanes.map(l => l.id)).toEqual(['running', 'other']);
    expect(lanes[1].tasks.map(t => t.id)).toEqual(['b']);
  });

  it('renders nothing at all for an empty board', () => {
    expect(groupIntoLanes([])).toEqual([]);
  });
});
