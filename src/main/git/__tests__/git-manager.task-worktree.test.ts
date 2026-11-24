import { join } from 'path';

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { GitManager } from '../git-manager';

vi.unmock('path');
vi.mock('@/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/utils', () => ({
  execWithShellPath: vi.fn(),
  withLock: vi.fn((_id: string, fn: () => Promise<unknown>) => fn()),
}));

import { AIDER_DESK_TASKS_DIR } from '@/constants';
import { execWithShellPath } from '@/utils';

const projectPath = '/test/project';
const taskId = 'task-123';
const taskWorktreePath = join(projectPath, AIDER_DESK_TASKS_DIR, taskId, 'worktree');

describe('GitManager - getTaskWorktree', () => {
  let gitManager: GitManager;

  const mockWorktreeList = (taskWorktreeEntry: string) => {
    (execWithShellPath as Mock).mockImplementation(async (command: string) => {
      if (command === 'git worktree list --porcelain') {
        const stdout = `worktree ${projectPath}\nHEAD abc123\nbranch refs/heads/main\n\n${taskWorktreeEntry}\n`;
        return { stdout, stderr: '' };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    gitManager = new GitManager();
  });

  it('returns the task worktree when it exists and is valid', async () => {
    mockWorktreeList(`worktree ${taskWorktreePath}\nHEAD def456\nbranch refs/heads/aider-desk/task/t2`);

    const worktree = await gitManager.getTaskWorktree(projectPath, taskId);

    expect(worktree).toEqual({
      path: taskWorktreePath,
      branch: 'aider-desk/task/t2',
      baseCommit: 'def456',
    });
  });

  it('returns null when the task worktree is prunable (stale registration)', async () => {
    mockWorktreeList(`worktree ${taskWorktreePath}\nHEAD def456\nbranch refs/heads/old-branch\nprunable`);

    const worktree = await gitManager.getTaskWorktree(projectPath, taskId);

    expect(worktree).toBeNull();
  });

  it('returns null when no worktree exists for the task', async () => {
    mockWorktreeList('');

    const worktree = await gitManager.getTaskWorktree(projectPath, taskId);

    expect(worktree).toBeNull();
  });
});

describe('GitManager - worktree paths reported by Git with forward slashes', () => {
  // Git for Windows prints worktree paths as C:/Users/..., while AiderDesk builds them with path.join (C:\Users\...)
  const toGitPath = (filePath: string) => filePath.replace(/\\/g, '/');

  let gitManager: GitManager;

  beforeEach(() => {
    vi.clearAllMocks();
    gitManager = new GitManager();
  });

  it('getTaskWorktree matches the task worktree', async () => {
    (execWithShellPath as Mock).mockImplementation(async (command: string) => {
      if (command === 'git worktree list --porcelain') {
        const stdout = `worktree ${toGitPath(projectPath)}\nHEAD abc123\nbranch refs/heads/main\n\nworktree ${toGitPath(taskWorktreePath)}\nHEAD def456\nbranch refs/heads/aider-desk/task/t2\n`;
        return { stdout, stderr: '' };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const worktree = await gitManager.getTaskWorktree(projectPath, taskId);

    expect(worktree).toEqual({
      path: taskWorktreePath,
      branch: 'aider-desk/task/t2',
      baseCommit: 'def456',
    });
  });

  it('close prunes prunable task worktrees', async () => {
    (execWithShellPath as Mock).mockImplementation(async (command: string) => {
      if (command === 'git worktree list --porcelain') {
        const stdout = `worktree ${toGitPath(projectPath)}\nHEAD abc123\nbranch refs/heads/main\n\nworktree ${toGitPath(taskWorktreePath)}\nHEAD def456\nbranch refs/heads/old-branch\nprunable gitdir file points to non-existent location\n`;
        return { stdout, stderr: '' };
      }
      if (command.startsWith('git worktree remove ')) {
        return { stdout: '', stderr: '' };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await gitManager.close(projectPath);

    expect(execWithShellPath).toHaveBeenCalledWith(`git worktree remove ${toGitPath(taskWorktreePath)}`, { cwd: projectPath });
  });
});
