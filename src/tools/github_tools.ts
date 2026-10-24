import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getRepoDir, parseRepoSlug } from './workspace_utils.js';

const execFileAsync = promisify(execFile);

export const createPullRequest = new FunctionTool({
  name: 'create_pull_request',
  description: 'Creates a Pull Request on GitHub for the pushed branch. Uses GITHUB_TOKEN if available, otherwise falls back to GitHub CLI (gh).',
  parameters: z.object({
    repoName: z.string().describe('The name of the cloned repository folder inside workspaces/.'),
    title: z.string().describe('The title of the Pull Request.'),
    body: z.string().describe('The markdown description detailing the changes, reasoning, and test results.'),
    headBranch: z.string().describe('The feature or fix branch containing the pushed commits.'),
    baseBranch: z.string().optional().describe('The base target branch (defaults to "main", falls back to "master").'),
    draft: z.boolean().optional().describe('Whether to create the Pull Request as a draft (defaults to false).'),
  }),
  execute: async ({ repoName, title, body, headBranch, baseBranch = 'main', draft = false }) => {
    try {
      const repoDir = getRepoDir(repoName);

      // Determine remote URL
      const { stdout: remoteOut } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
        cwd: repoDir,
      });
      const remoteUrl = remoteOut.trim();
      const slug = parseRepoSlug(remoteUrl);

      if (!slug) {
        return {
          status: 'error',
          error: `Could not parse GitHub owner/repo from remote URL '${remoteUrl}'. Please verify it is a GitHub repository.`,
        };
      }

      const { owner, repo } = slug;
      const token = process.env.GITHUB_TOKEN?.trim();

      // Method 1: GitHub REST API via GITHUB_TOKEN
      if (token) {
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'ADK-Coding-Agent',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title,
            body,
            head: headBranch,
            base: baseBranch,
            draft,
          }),
        });

        const data: any = await response.json();

        if (response.ok) {
          return {
            status: 'success',
            prNumber: data.number,
            prUrl: data.html_url,
            title: data.title,
            baseBranch: data.base?.ref,
            headBranch: data.head?.ref,
            message: `Pull Request #${data.number} successfully created: ${data.html_url}`,
          };
        }

        // If base branch failed (e.g. main vs master), try master if default was main
        if (response.status === 422 && baseBranch === 'main') {
          const retryResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${token}`,
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'ADK-Coding-Agent',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title,
              body,
              head: headBranch,
              base: 'master',
              draft,
            }),
          });
          const retryData: any = await retryResponse.json();
          if (retryResponse.ok) {
            return {
              status: 'success',
              prNumber: retryData.number,
              prUrl: retryData.html_url,
              title: retryData.title,
              baseBranch: 'master',
              headBranch: retryData.head?.ref,
              message: `Pull Request #${retryData.number} successfully created targeting 'master': ${retryData.html_url}`,
            };
          }
        }

        return {
          status: 'error',
          error: data.message || 'GitHub API returned an error.',
          details: data.errors,
          hint: 'Ensure GITHUB_TOKEN in .env has repository ("repo") write permissions and the branch is pushed.',
        };
      }

      // Method 2: GitHub CLI (gh) fallback
      try {
        const ghArgs = [
          'pr',
          'create',
          '--repo',
          `${owner}/${repo}`,
          '--title',
          title,
          '--body',
          body,
          '--head',
          headBranch,
          '--base',
          baseBranch,
        ];
        if (draft) ghArgs.push('--draft');

        const { stdout, stderr } = await execFileAsync('gh', ghArgs, { cwd: repoDir });
        const prUrl = (stdout || '').trim();

        return {
          status: 'success',
          prUrl,
          message: `Pull Request created via GitHub CLI: ${prUrl}`,
        };
      } catch (ghErr: any) {
        return {
          status: 'error',
          error: `GitHub token is not set in .env, and GitHub CLI (gh) failed: ${ghErr.message}`,
          hint: 'Please provide GITHUB_TOKEN=your_token in .env or run `gh auth login` in your terminal.',
        };
      }
    } catch (err: any) {
      return { status: 'error', error: err.message || String(err) };
    }
  },
});
