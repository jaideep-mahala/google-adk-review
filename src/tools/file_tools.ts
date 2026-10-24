import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRepoDir } from './workspace_utils.js';

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.venv',
  '__pycache__',
]);

function safeResolve(repoDir: string, relativePath: string): string {
  const resolved = path.resolve(repoDir, relativePath);
  if (!resolved.startsWith(repoDir)) {
    throw new Error(`Security Violation: Path '${relativePath}' escapes repository root.`);
  }
  return resolved;
}

export const listFiles = new FunctionTool({
  name: 'list_files',
  description: 'Lists files and folders inside the repository workspace, with support for subdirectories and depth limit.',
  parameters: z.object({
    repoName: z.string().describe('The name of the cloned repository folder inside workspaces/.'),
    subDirectory: z.string().optional().describe('Relative path to start listing from (defaults to repo root).'),
    maxDepth: z.number().optional().describe('Maximum folder traversal depth (defaults to 3).'),
  }),
  execute: async ({ repoName, subDirectory = '', maxDepth = 3 }) => {
    try {
      const repoDir = getRepoDir(repoName);
      const startDir = safeResolve(repoDir, subDirectory);

      if (!fs.existsSync(startDir)) {
        return { status: 'error', error: `Directory '${subDirectory}' does not exist.` };
      }

      const results: { path: string; isDirectory: boolean; sizeBytes?: number }[] = [];

      function walk(currentDir: string, currentDepth: number) {
        if (currentDepth > maxDepth) return;
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          if (IGNORED_DIRS.has(entry.name)) continue;

          const fullPath = path.join(currentDir, entry.name);
          const relPath = path.relative(repoDir, fullPath).replace(/\\/g, '/');

          if (entry.isDirectory()) {
            results.push({ path: relPath, isDirectory: true });
            walk(fullPath, currentDepth + 1);
          } else if (entry.isFile()) {
            const stats = fs.statSync(fullPath);
            results.push({ path: relPath, isDirectory: false, sizeBytes: stats.size });
          }
        }
      }

      walk(startDir, 1);

      return {
        status: 'success',
        repoName,
        totalItems: results.length,
        items: results.slice(0, 200), // Cap at 200 items to fit in context nicely
      };
    } catch (err: any) {
      return { status: 'error', error: err.message || String(err) };
    }
  },
});

export const readFile = new FunctionTool({
  name: 'read_file',
  description: 'Reads the content of a file from the repository, with optional line range pagination.',
  parameters: z.object({
    repoName: z.string().describe('The name of the cloned repository folder inside workspaces/.'),
    filePath: z.string().describe('Relative path to the file inside the repository (e.g. src/index.ts).'),
    startLine: z.number().optional().describe('Optional starting line number (1-indexed).'),
    endLine: z.number().optional().describe('Optional ending line number (1-indexed, inclusive).'),
  }),
  execute: async ({ repoName, filePath, startLine, endLine }) => {
    try {
      const repoDir = getRepoDir(repoName);
      const targetPath = safeResolve(repoDir, filePath);

      if (!fs.existsSync(targetPath)) {
        return { status: 'error', error: `File '${filePath}' does not exist.` };
      }

      const content = fs.readFileSync(targetPath, 'utf8');
      const lines = content.split('\n');
      const totalLines = lines.length;

      const start = Math.max(1, startLine || 1);
      const end = Math.min(totalLines, endLine || totalLines);

      const selectedLines = lines.slice(start - 1, end).map((line, idx) => {
        const lineNum = start + idx;
        return `${lineNum}: ${line}`;
      });

      return {
        status: 'success',
        filePath,
        totalLines,
        showingLines: `${start}-${end}`,
        content: selectedLines.join('\n'),
      };
    } catch (err: any) {
      return { status: 'error', error: err.message || String(err) };
    }
  },
});

export const writeFile = new FunctionTool({
  name: 'write_file',
  description: 'Creates or updates a file inside the repository workspace with the provided content.',
  parameters: z.object({
    repoName: z.string().describe('The name of the cloned repository folder inside workspaces/.'),
    filePath: z.string().describe('Relative path to the file to create or edit (e.g. src/utils.ts).'),
    content: z.string().describe('The complete source code or text content to write to the file.'),
  }),
  execute: async ({ repoName, filePath, content }) => {
    try {
      const repoDir = getRepoDir(repoName);
      const targetPath = safeResolve(repoDir, filePath);

      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(targetPath, content, 'utf8');
      const stats = fs.statSync(targetPath);

      return {
        status: 'success',
        filePath,
        bytesWritten: stats.size,
        message: `Successfully wrote ${stats.size} bytes to '${filePath}'.`,
      };
    } catch (err: any) {
      return { status: 'error', error: err.message || String(err) };
    }
  },
});

export const searchCode = new FunctionTool({
  name: 'search_code',
  description: 'Searches for text or regex pattern across files in the repository codebase.',
  parameters: z.object({
    repoName: z.string().describe('The name of the cloned repository folder inside workspaces/.'),
    query: z.string().describe('Search query string or regex pattern.'),
    caseSensitive: z.boolean().optional().describe('Whether the search should be case sensitive (defaults to false).'),
    fileExtension: z.string().optional().describe('Optional file extension filter (e.g. .ts, .js, .py).'),
  }),
  execute: async ({ repoName, query, caseSensitive = false, fileExtension }) => {
    try {
      const repoDir = getRepoDir(repoName);
      const flags = caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(query, flags);
      const matches: { file: string; line: number; text: string }[] = [];

      function walkAndSearch(dir: string) {
        if (matches.length >= 50) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (IGNORED_DIRS.has(entry.name)) continue;
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            walkAndSearch(fullPath);
          } else if (entry.isFile()) {
            if (fileExtension && !entry.name.endsWith(fileExtension)) continue;

            try {
              const fileContent = fs.readFileSync(fullPath, 'utf8');
              const lines = fileContent.split('\n');

              for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                  matches.push({
                    file: path.relative(repoDir, fullPath).replace(/\\/g, '/'),
                    line: i + 1,
                    text: lines[i].trim().slice(0, 150),
                  });
                  if (matches.length >= 50) return;
                }
              }
            } catch {
              // Skip binary or unreadable files
            }
          }
        }
      }

      walkAndSearch(repoDir);

      return {
        status: 'success',
        query,
        totalMatches: matches.length,
        matches,
      };
    } catch (err: any) {
      return { status: 'error', error: err.message || String(err) };
    }
  },
});
