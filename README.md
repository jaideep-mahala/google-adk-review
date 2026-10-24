# Autonomous Software Engineering & PR Agent (Google ADK)

A full-featured TypeScript agent built with Google's **Agent Development Kit (`@google/adk`)** that autonomously clones Git repositories, analyzes source code, reproduces errors, edits files, executes tests, and opens GitHub Pull Requests.

---

## 🚀 Key Capabilities

- **Git & Repository Operations**:
  - `clone_repository`: Clones remote Git repositories into a local, isolated `workspaces/` folder with token authentication.
  - `git_create_branch`: Spawns clean feature or fix branches.
  - `git_status` & `git_diff`: Audits local modifications and inspects exact diffs.
  - `git_commit`: Stages files and creates commits with conventional commit messages.
  - `git_push`: Pushes changes to the remote origin.
- **Code Inspection & Editing**:
  - `list_files`: Recursively traverses directory structures while ignoring noise (`node_modules`, `.git`, etc.).
  - `search_code`: Performs regex and substring searches across codebases.
  - `read_file`: Reads files with line numbering and range support.
  - `write_file`: Modifies existing code or creates new source files.
- **Test & Build Execution**:
  - `run_command`: Executes any test suite (`npm test`, `pytest`, `cargo test`), type check, or build script inside the repository workspace.
- **GitHub PR Automation**:
  - `create_pull_request`: Automatically creates Pull Requests via the GitHub REST API (`GITHUB_TOKEN`) or falls back to local GitHub CLI (`gh`).

---

## 📁 Project Structure

```
ai-review/
├── src/
│   ├── agent.ts                  # Autonomous Coding Agent definition & tools registration
│   ├── index.ts                  # CLI runner with InMemoryRunner
│   └── tools/
│       ├── workspace_utils.ts    # Workspace path security & URL parsing
│       ├── git_tools.ts          # Clone, branch, commit, diff, push tools
│       ├── file_tools.ts         # List, read, write, search tools
│       ├── command_tools.ts      # Terminal & test runner execution tool
│       └── github_tools.ts       # GitHub Pull Request creation tool
├── workspaces/                   # Local storage for cloned repositories (.gitignored)
├── .env                          # Local credentials (Gemini API key, GitHub token)
├── .env.example                  # Template for environment variables
├── package.json                  # Dependencies & scripts
└── tsconfig.json                 # TypeScript compiler configuration
```

---

## 🔑 Environment Configuration

Edit `.env` in the root directory:

```env
# Gemini API Key (from https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_GENAI_API_KEY=your_gemini_api_key

# GitHub Personal Access Token (with 'repo' scope)
# Used to clone private repos, push branches, and create PRs
GITHUB_TOKEN=your_github_token
```

---

## 🛠️ How to Run

### 1. Web UI Mode (`ADK DevTools`)
Start the interactive Web UI:
```bash
npx adk web --reload_agents true
```
Open **`http://localhost:8000/dev-ui`** in your browser. You can give the agent natural language tasks such as:
> *"Clone https://github.com/my-org/my-repo, run the tests, fix any failing assertions in src/auth.ts, commit, and create a PR targeting main."*

### 2. Terminal CLI Mode
Run the agent directly from the command line:
```bash
# Run with default capabilities prompt:
npm start

# Or provide a custom prompt directly:
npm start "Clone https://github.com/owner/repo.git and inspect package.json"
```

### 3. Type Checking
```bash
npm run type-check
```
