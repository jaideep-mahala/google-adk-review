import * as path from 'node:path';
import * as fs from 'node:fs';

export const WORKSPACE_ROOT = path.resolve(process.cwd(), 'workspaces');

export function ensureWorkspaceDir(): string {
  if (!fs.existsSync(WORKSPACE_ROOT)) {
    fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
  }
  return WORKSPACE_ROOT;
}

export function getRepoDir(repoName: string): string {
  ensureWorkspaceDir();
  // Strip any leading/trailing slashes or path separators
  const cleanName = path.basename(repoName.replace(/\.git$/i, ''));
  const targetDir = path.resolve(WORKSPACE_ROOT, cleanName);
  
  // Security guard against path traversal
  if (!targetDir.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`Invalid repository name: ${repoName}`);
  }
  return targetDir;
}

export function parseRepoSlug(repoUrl: string): { owner: string; repo: string } | null {
  // Support both HTTPS (https://github.com/owner/repo.git) and SSH (git@github.com:owner/repo.git)
  const httpsMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/i);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  const sshMatch = repoUrl.match(/git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  return null;
}

export function extractRepoNameFromUrl(url: string): string {
  const parsed = parseRepoSlug(url);
  if (parsed) {
    return parsed.repo;
  }
  const clean = url.trim().replace(/\/+$/, '');
  const parts = clean.split('/');
  return parts[parts.length - 1].replace(/\.git$/i, '');
}
