import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRepoDir, extractRepoNameFromUrl } from './workspace_utils.js';

const execFileAsync = promisify(execFile);

function execGit(args: string[], cwd: string, envOverrides: Record<string, string> = {}): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, {
    cwd,
    env: {
      ...process.env,
      ...envOverrides,
      GIT_TERMINAL_PROMPT: '0', // Do not block on interactive password prompts
    },
    maxBuffer: 10 * 1024 * 1024,
  });
}

function injectTokenIntoUrl(repoUrl: string, token: string): string {
  if (!token) return repoUrl;
  try {
    const parsed = new URL(repoUrl);
    if (parsed.protocol === 'https:' && parsed.hostname === 'github.com') {
      parsed.username = 'x-access-token';
      parsed.password = token;
      return parsed.toString();
    }
  } catch {
    // If not a standard URL, return as is
  }
  return repoUrl;
}

export const cloneRepository = new FunctionTool({
  name: 'clone_repository',
  description: 'Clones a remote Git repository into the local workspaces directory for analysis, editing, and PR creation.',
  parameters: z.object({
    repoUrl: z.string().describe('The Git repository URL to clone (e.g., https://github.com/owner/repo.git or git@github.com:owner/repo.git)'),
    branch: z.string().optional().describe('Optional specific branch to checkout after cloning.'),
    customRepoName: z.string().optional().describe('Optional custom folder name inside workspaces/ (defaults to the repo name from the URL).'),
  }),
  execute: async ({ repoUrl, branch, customRepoName }) => {
    try {
      const folderName = customRepoName || extractRepoNameFromUrl(repoUrl);
      const targetDir = getRepoDir(folderName);
      const token = process.env.GITHUB_TOKEN?.trim() || '';

      if (fs.existsSync(targetDir)) {
        // Repo already cloned, check status
        const { stdout: branchOut } = await execGit(['branch', '--show-current'], targetDir);
        const { stdout: statusOut } = await execGit(['status', '--short'], targetDir);
        return {
          status: 'already_exists',
          repoName: folderName,
          path: targetDir,
          currentBranch: branchOut.trim(),
          uncommittedChanges: statusOut.trim() ? statusOut.trim().split('\n') : [],
          message: `Repository already exists at ${targetDir}. Ready for analysis.`,
        };
      }

      // Prepare clone URL with token if available
      const authenticatedUrl = injectTokenIntoUrl(repoUrl, token);
      const cloneArgs = ['clone', authenticatedUrl, targetDir];
      if (branch) {
        cloneArgs.push('-b', branch);
      }

      await execFileAsync('git', cloneArgs, {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });

      // Ensure origin remote doesn't leak token in plain text if saved
      if (token) {
        await execGit(['remote', 'set-url', 'origin', repoUrl], targetDir).catch(() => {});
      }

      const { stdout: branchOut } = await execGit(['branch', '--show-current'], targetDir);
      const topFiles = fs.readdirSync(targetDir).filter((f) => !f.startsWith('.'));

      return {
        status: 'success',
        repoName: folderName,
        path: targetDir,
        currentBranch: branchOut.trim(),
        topLevelFiles: topFiles,
        message: `Successfully cloned ${repoUrl} into ${targetDir}.`,
      };
    } catch (err: any) {
      return {
        status: 'error',
        error: err.message || String(err),
      };
    }
  },
});

export const gitCreateBranch = new FunctionTool({
  name: 'git_create_branch',
  description: 'Creates and checks out a new Git branch inside the local cloned repository.',
  parameters: z.object({
    repoName: z.string().describe('The name of the cloned repository folder inside workspaces/.'),
    branchName: z.string().describe('The name of the new branch to create (e.g. fix/resolve-bug or feat/add-feature).'),
  }),
  execute: async ({ repoName, branchName }) => {
    try {
      const targetDir = getRepoDir(repoName);
      await execGit(['checkout', '-b', branchName], targetDir);
      return {
        status: 'success',
        repoName,
        branch: branchName,
        message: `Created and checked out new branch '${branchName}'.`,
      };
    } catch (err: any) {
      return { status: 'error', error: err.message || String(err) };
    }
  },
});

export const gitStatus = new FunctionTool({
  name: 'git_status',
  description: 'Checks the git status and modified/untracked files in the repository.',
  parameters: z.object({
    repoName: z.string().describe('The name of the cloned repository folder inside workspaces/.'),
  }),
  execute: async ({ repoName }) => {
    try {
      const targetDir = getRepoDir(repoName);
      const { stdout: branchOut } = await execGit(['branch', '--show-current'], targetDir);
      const { stdout: statusOut } = await execGit(['status', '--short'], targetDir);
      return {
        status: 'success',
        repoName,
        branch: branchOut.trim(),
        changes: statusOut.trim() ? statusOut.trim().split('\n') : [],
        isClean: !statusOut.trim(),
      };
    } catch (err: any) {
      return { status: 'error', error: err.message || String(err) };
    }
  },
});

export const gitDiff = new FunctionTool({
  name: 'git_diff',
  description: 'Returns the git diff of uncommitted or staged changes in the repository.',
  parameters: z.object({
    repoName: z.string().describe('The name of the cloned repository folder inside workspaces/.'),
    staged: z.boolean().optional().describe('Set to true to view staged changes (--cached). Defaults to false.'),
  }),
  execute: async ({ repoName, staged }) => {
    try {
      const targetDir = getRepoDir(repoName);
      const args = staged ? ['diff', '--cached'] : ['diff'];
      const { stdout } = await execGit(args, targetDir);
      return {
        status: 'success',
        repoName,
        diff: stdout || '(No diff detected)',
      };
    } catch (err: any) {
      return { status: 'error', error: err.message || String(err) };
    }
  },
});

export const gitCommit = new FunctionTool({
  name: 'git_commit',
  description: 'Stages modified files and creates a Git commit with a descriptive message.',
  parameters: z.object({
    repoName: z.string().describe('The name of the cloned repository folder inside workspaces/.'),
    message: z.string().describe('Descriptive Git commit message explaining what was fixed or implemented.'),
    files: z.array(z.string()).optional().describe('Optional list of relative file paths to stage. Defaults to staging all changes (".").'),
  }),
  execute: async ({ repoName, message, files }) => {
    try {
      const targetDir = getRepoDir(repoName);
      if (files && files.length > 0) {
        await execGit(['add', ...files], targetDir);
      } else {
        await execGit(['add', '-A'], targetDir);
      }

      const { stdout: commitOut } = await execGit(['commit', '-m', message], targetDir);
      const { stdout: revOut } = await execGit(['rev-parse', '--short', 'HEAD'], targetDir);

      return {
        status: 'success',
        commitHash: revOut.trim(),
        output: commitOut.trim(),
        message: `Successfully created commit [${revOut.trim()}]: ${message}`,
      };
    } catch (err: any) {
      return { status: 'error', error: err.message || String(err) };
    }
  },
});

export const gitPush = new FunctionTool({
  name: 'git_push',
  description: 'Pushes the current branch or specified branch to the remote Git repository.',
  parameters: z.object({
    repoName: z.string().describe('The name of the cloned repository folder inside workspaces/.'),
    branch: z.string().optional().describe('Branch to push. Defaults to the current active branch.'),
    remote: z.string().optional().describe('Remote name. Defaults to "origin".'),
  }),
  execute: async ({ repoName, branch, remote = 'origin' }) => {
    try {
      const targetDir = getRepoDir(repoName);
      const token = process.env.GITHUB_TOKEN?.trim() || '';

      const targetBranch = branch || (await execGit(['branch', '--show-current'], targetDir)).stdout.trim();
      const { stdout: remoteUrlOut } = await execGit(['remote', 'get-url', remote], targetDir);
      const remoteUrl = remoteUrlOut.trim();

      // If token is provided and remote is HTTPS GitHub, use token for authentication
      let pushTarget = remote;
      if (token && remoteUrl.startsWith('https://github.com')) {
        pushTarget = injectTokenIntoUrl(remoteUrl, token);
      }

      const { stdout, stderr } = await execGit(['push', '-u', pushTarget, targetBranch], targetDir);
      return {
        status: 'success',
        branch: targetBranch,
        remote,
        output: (stdout + '\n' + stderr).trim(),
        message: `Pushed branch '${targetBranch}' to remote '${remote}'.`,
      };
    } catch (err: any) {
      return { status: 'error', error: err.message || String(err) };
    }
  },
});
