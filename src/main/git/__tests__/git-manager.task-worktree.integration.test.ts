import { mkdtemp, realpath, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { simpleGit } from 'simple-git';

import { GitManager } from '../git-manager';

vi.unmock('fs');
vi.unmock('path');

describe('GitManager task worktree lookup with real git', () => {
  let projectPath: string;
  let manager: GitManager;

  beforeEach(async () => {
    vi.stubEnv('GIT_INDEX_FILE', undefined);
    projectPath = await realpath(await mkdtemp(join(tmpdir(), 'aiderdesk-task-worktree-')));
    manager = new GitManager();
    const git = simpleGit(projectPath);
    await git.init();
    await git.addConfig('user.name', 'Test');
    await git.addConfig('user.email', 'test@example.invalid');
    await git.checkoutLocalBranch('main');
    await writeFile(join(projectPath, 'tracked.txt'), 'initial');
    await git.add('tracked.txt');
    await git.commit('initial');
  });

  afterEach(async () => {
    try {
      await rm(projectPath, { recursive: true, force: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('finds the task worktree it created', async () => {
    const created = await manager.createWorktree(projectPath, 'task-1', 'task-branch');

    const worktree = await manager.getTaskWorktree(projectPath, 'task-1');

    expect(worktree).toMatchObject({ path: created.path, branch: 'task-branch' });
  });

  it.runIf(process.platform === 'win32')('finds the task worktree when the project path has a lowercase drive letter', async () => {
    const lowerDrivePath = projectPath.charAt(0).toLowerCase() + projectPath.slice(1);
    const created = await manager.createWorktree(lowerDrivePath, 'task-1', 'task-branch');

    const worktree = await manager.getTaskWorktree(lowerDrivePath, 'task-1');

    expect(worktree).toMatchObject({ path: created.path, branch: 'task-branch' });
  });

  it('prunes the registration of a deleted task worktree on close', async () => {
    const created = await manager.createWorktree(projectPath, 'task-1', 'task-branch');
    await rm(created.path, { recursive: true, force: true });

    await manager.close(projectPath);

    expect(await simpleGit(projectPath).raw(['worktree', 'list', '--porcelain'])).not.toContain('task-1');
  });
});
