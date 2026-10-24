import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { exec } from 'node:child_process';
import { getRepoDir } from './workspace_utils.js';

export const runCommand = new FunctionTool({
  name: 'run_command',
  description: 'Executes a build, test, lint, or terminal command inside the cloned repository workspace directory.',
  parameters: z.object({
    repoName: z.string().describe('The name of the cloned repository folder inside workspaces/.'),
    command: z.string().describe('The command to execute (e.g. npm test, npm run build, npx tsc, pytest, etc.).'),
    timeoutSeconds: z.number().optional().describe('Maximum execution time in seconds (defaults to 60s).'),
  }),
  execute: async ({ repoName, command, timeoutSeconds = 60 }) => {
    try {
      const repoDir = getRepoDir(repoName);
      const startTime = Date.now();

      return await new Promise((resolve) => {
        exec(
          command,
          {
            cwd: repoDir,
            timeout: timeoutSeconds * 1000,
            maxBuffer: 5 * 1024 * 1024,
            env: {
              ...process.env,
              CI: 'true', // Non-interactive mode for testing runners
            },
          },
          (error, stdout, stderr) => {
            const durationMs = Date.now() - startTime;
            if (error) {
              resolve({
                status: 'failed',
                exitCode: error.code ?? 1,
                timedOut: error.killed && error.signal === 'SIGTERM',
                stdout: (stdout || '').trim().slice(-4000), // Last 4000 chars
                stderr: (stderr || '').trim().slice(-4000),
                durationMs,
                message: `Command '${command}' exited with code ${error.code ?? 1}.`,
              });
            } else {
              resolve({
                status: 'success',
                exitCode: 0,
                stdout: (stdout || '').trim().slice(-4000),
                stderr: (stderr || '').trim().slice(-4000),
                durationMs,
                message: `Command '${command}' executed successfully.`,
              });
            }
          }
        );
      });
    } catch (err: any) {
      return { status: 'error', error: err.message || String(err) };
    }
  },
});
