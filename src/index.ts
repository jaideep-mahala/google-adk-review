import 'dotenv/config';
import {
  InMemoryRunner,
  stringifyContent,
  getFunctionCalls,
  getFunctionResponses,
  isFinalResponse,
} from '@google/adk';
import { rootAgent, cloneRepository } from './agent.js';

async function main() {
  console.log('====================================================');
  console.log('🛠️  Google ADK Autonomous Coding & PR Agent');
  console.log('====================================================\n');

  // 1. Tool availability test
  console.log('👉 [1/2] Verifying Core Tools:');
  console.log(`- Loaded Agent: ${rootAgent.name}`);
  console.log(`- Model: ${rootAgent.model}`);
  console.log(`- Available Tools (${(rootAgent as any).tools?.length ?? 0}):`);
  for (const tool of (rootAgent as any).tools || []) {
    console.log(`  • ${tool.name}: ${tool.description?.slice(0, 75)}...`);
  }

  // 2. Checking API key configuration
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    console.log('\n⚠️  Notice: GEMINI_API_KEY or GOOGLE_GENAI_API_KEY is not set in .env.');
    console.log('To run the end-to-end agent LLM loop with Gemini:');
    console.log('  1. Open .env');
    console.log('  2. Set GEMINI_API_KEY=your_actual_gemini_api_key');
    console.log('  3. Run `npm start` again\n');
    return;
  }

  // Ensure GOOGLE_GENAI_API_KEY is populated if GEMINI_API_KEY was provided
  if (!process.env.GOOGLE_GENAI_API_KEY && process.env.GEMINI_API_KEY) {
    process.env.GOOGLE_GENAI_API_KEY = process.env.GEMINI_API_KEY;
  }

  // Check GITHUB_TOKEN status
  if (!process.env.GITHUB_TOKEN) {
    console.log('\n💡 Tip: Set GITHUB_TOKEN in .env to enable direct GitHub PR creation & authenticated cloning.');
  }

  // 3. Running Agent with InMemoryRunner
  console.log('\n👉 [2/2] Running Agent with InMemoryRunner:');
  const runner = new InMemoryRunner({
    agent: rootAgent,
    appName: 'coding_agent_app',
  });

  const userId = 'developer_user';
  const sessionId = `dev_session_${Date.now()}`;

  // Initialize session
  await runner.sessionService.createSession({
    appName: runner.appName,
    userId,
    sessionId,
  });

  // Allow custom prompt from terminal arguments: `npm start "clone https://github.com/..."`
  const cliPrompt = process.argv.slice(2).join(' ').trim();
  const promptText = cliPrompt || 'List the capabilities you have for cloning, inspecting code, and creating pull requests.';

  console.log(`User Prompt: "${promptText}"\n`);

  try {
    const eventStream = runner.runAsync({
      userId,
      sessionId,
      newMessage: {
        role: 'user',
        parts: [{ text: promptText }],
      },
    });

    for await (const event of eventStream) {
      // Check for function / tool calls
      const calls = getFunctionCalls(event);
      if (calls && calls.length > 0) {
        for (const call of calls) {
          console.log(`🔧 Tool Call: ${call.name}(${JSON.stringify(call.args, null, 2)})`);
        }
      }

      // Check for tool responses
      const responses = getFunctionResponses(event);
      if (responses && responses.length > 0) {
        for (const resp of responses) {
          console.log(`📦 Tool Response for ${resp.name}:`, JSON.stringify(resp.response, null, 2));
        }
      }

      // Text output
      const text = stringifyContent(event);
      if (text) {
        console.log(`🤖 Agent: ${text}`);
      }

      if (isFinalResponse(event)) {
        console.log('\n✅ Received final response from agent.');
      }
    }

    console.log('\n🎉 Agent run finished successfully!');
  } catch (error: any) {
    console.error('\n❌ Error running agent:', error.message || error);
  }
}

main().catch(console.error);
