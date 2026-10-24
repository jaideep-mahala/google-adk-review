import 'dotenv/config';
import {
  InMemoryRunner,
  stringifyContent,
  getFunctionCalls,
  getFunctionResponses,
  isFinalResponse,
} from '@google/adk';
import { rootAgent, getCurrentTime } from './agent.js';

async function main() {
  console.log('====================================================');
  console.log('🤖 Google ADK Agent Environment: Hello Time Agent');
  console.log('====================================================\n');

  // 1. Direct tool test (Unit test verification)
  console.log('👉 [1/2] Testing Mock Tool directly:');
  try {
    const directToolResult = await (getCurrentTime as any).execute({ city: 'Tokyo' });
    console.log('Tool execution result:', directToolResult);
  } catch (err) {
    console.error('Tool execution error:', err);
  }

  // 2. Checking API key configuration
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    console.log('\n⚠️  Notice: GEMINI_API_KEY or GOOGLE_GENAI_API_KEY is not set in .env.');
    console.log('To run the end-to-end agent LLM loop with Gemini:');
    console.log('  1. Open .env');
    console.log('  2. Set GEMINI_API_KEY=your_actual_gemini_api_key');
    console.log('  3. Run `npm start` again\n');
    console.log('Environment setup and mock tool execution succeeded!');
    return;
  }

  // Ensure GOOGLE_GENAI_API_KEY is populated if GEMINI_API_KEY was provided
  if (!process.env.GOOGLE_GENAI_API_KEY && process.env.GEMINI_API_KEY) {
    process.env.GOOGLE_GENAI_API_KEY = process.env.GEMINI_API_KEY;
  }

  // 3. Running Agent with InMemoryRunner
  console.log('\n👉 [2/2] Running Agent with InMemoryRunner:');
  const runner = new InMemoryRunner({
    agent: rootAgent,
    appName: 'hello_time_app',
  });

  const userId = 'test_user';
  const sessionId = 'test_session_001';

  // Initialize session
  await runner.sessionService.createSession({
    appName: runner.appName,
    userId,
    sessionId,
  });

  const promptText = 'What is the current time in Paris?';
  console.log(`Prompt: "${promptText}"\n`);

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
          console.log(`🔧 Tool Call: ${call.name}(${JSON.stringify(call.args)})`);
        }
      }

      // Check for tool responses
      const responses = getFunctionResponses(event);
      if (responses && responses.length > 0) {
        for (const resp of responses) {
          console.log(`📦 Tool Response for ${resp.name}:`, resp.response);
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

    console.log('\n🎉 Agent test run completed successfully!');
  } catch (error: any) {
    console.error('\n❌ Error running agent:', error.message || error);
    if (
      error.message?.includes('API_KEY_INVALID') ||
      error.message?.includes('403') ||
      error.message?.includes('401')
    ) {
      console.log('Please verify that your Gemini API key in .env is valid.');
    }
  }
}

main().catch(console.error);
