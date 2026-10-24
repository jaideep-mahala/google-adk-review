# Google ADK TypeScript Agent Environment

This project is a complete TypeScript setup for building and testing AI agents with Google's **Agent Development Kit (`@google/adk`)**.

---

## 📁 Project Structure

```
ai-review/
├── src/
│   ├── agent.ts          # Agent definition & mock tools (FunctionTool, LlmAgent)
│   └── index.ts          # Agent runner script with InMemoryRunner & session handling
├── dist/                 # Compiled JavaScript output (generated on build)
├── .env                  # Local environment file (API keys)
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore rules for node_modules, dist, and .env
├── package.json          # Dependencies & scripts
├── tsconfig.json         # TypeScript compiler configuration (NodeNext / ESM)
└── README.md             # Documentation
```

---

## 🛠️ Requirements & Setup

- **Node.js**: `v20.19.0` or newer (Installed: `v24.22.1`)
- **Package Manager**: `npm` (Installed: `v11.19.1`)

All required dependencies are installed:
- `@google/adk`: Google Agent Development Kit for TypeScript
- `zod`: Schema definition and validation for tools
- `dotenv`: Environment variable loader
- `typescript`, `tsx`, `@types/node`: Fast TypeScript execution and compilation

---

## 🔑 Configure API Key

1. Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Open the `.env` file in the root directory:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   ```

*(Note: Both `GEMINI_API_KEY` and `GOOGLE_GENAI_API_KEY` are supported).*

---

## 🚀 Available Commands

| Command | Description |
|---|---|
| `npm start` | Runs the agent test runner immediately using `tsx` |
| `npm run dev` | Runs the agent in watch mode (auto-reloads on file changes) |
| `npm run type-check` | Runs the TypeScript compiler check without emitting files (`tsc --noEmit`) |
| `npm run build` | Compiles TypeScript files into the `./dist` folder |

---

## 📝 Code Explanation

### 1. `src/agent.ts`
Defines the `FunctionTool` (`get_current_time`) and `LlmAgent` (`hello_time_agent`):

```typescript
import { FunctionTool, LlmAgent } from '@google/adk';
import { z } from 'zod';

/* Mock tool implementation */
export const getCurrentTime = new FunctionTool({
  name: 'get_current_time',
  description: 'Returns the current time in a specified city.',
  parameters: z.object({
    city: z.string().describe("The name of the city for which to retrieve the current time."),
  }),
  execute: ({ city }) => {
    return { status: 'success', report: `The current time in ${city} is 10:30 AM` };
  },
});

export const rootAgent = new LlmAgent({
  name: 'hello_time_agent',
  model: 'gemini-flash-latest',
  description: 'Tells the current time in a specified city.',
  instruction: `You are a helpful assistant that tells the current time in a city.
                Use the 'get_current_time' tool for this purpose.`,
  tools: [getCurrentTime],
});
```

### 2. `src/index.ts`
Sets up an `InMemoryRunner`, provisions a session with `sessionService.createSession`, and streams events using `runner.runAsync(...)`. It logs tool calls, tool outputs, and LLM responses in real-time.
