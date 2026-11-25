import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextManager } from '../context-manager';

import type { ContextMessage } from '@common/types';

const createMessage = (id: string, content: string): ContextMessage => ({
  id,
  role: 'user',
  content,
  timestamp: Date.now(),
});

const getContextPath = (projectDir: string, taskId = 'task-1') => path.join(projectDir, '.aider-desk', 'tasks', taskId, 'context.json');

const createTask = (projectDir: string) => ({
  getProjectDir: () => projectDir,
  getTaskDir: () => projectDir,
  sendContextInfoUpdated: vi.fn(),
});

const writeContext = async (projectDir: string, messages: ContextMessage[]) => {
  const contextPath = getContextPath(projectDir);
  await fs.mkdir(path.dirname(contextPath), { recursive: true });
  await fs.writeFile(contextPath, JSON.stringify({ version: 2, contextMessages: messages, contextFiles: [] }), 'utf8');
};

const failNextContextRead = () =>
  vi.spyOn(fs, 'readFile').mockImplementationOnce((async () => {
    throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
  }) as typeof fs.readFile);

describe('ContextManager - load failure', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aider-desk-context-load-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('reads the context from disk again after a failed load', async () => {
    const messages = [createMessage('message-1', 'Keep me')];
    await writeContext(projectDir, messages);

    const manager = new ContextManager(createTask(projectDir) as never, 'task-1');
    const readFileSpy = failNextContextRead();

    await expect(manager.load()).rejects.toThrow('EBUSY');

    readFileSpy.mockRestore();
    await expect(manager.getContextMessages()).resolves.toEqual(messages);
  });

  it('does not overwrite the context on disk with unloaded state after a failed load', async () => {
    const messages = [createMessage('message-1', 'Keep me')];
    await writeContext(projectDir, messages);

    const manager = new ContextManager(createTask(projectDir) as never, 'task-1');
    const readFileSpy = failNextContextRead();

    await expect(manager.load()).rejects.toThrow('EBUSY');
    readFileSpy.mockRestore();

    manager.addContextMessage(createMessage('message-2', 'New message'));
    // autosave is debounced by 1 s
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const parsed = JSON.parse(await fs.readFile(getContextPath(projectDir), 'utf8'));
    expect(parsed.contextMessages).toEqual(messages);
  });
});
