import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '$env/dynamic/private';

// --- Types ---
interface LLMResponse {
  text: string;
  model: string;
}

export interface ApiKeys {
  google?: string;
  deepseek?: string;
  qwen?: string;
  doubao?: string;
  zhipu?: string;
  chatgpt?: string;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) return `${error.message} | cause: ${cause.message}`;
    if (cause && typeof cause === 'object' && 'message' in cause) {
      return `${error.message} | cause: ${String((cause as { message?: unknown }).message)}`;
    }
    return error.message;
  }
  return String(error);
}

// --- Providers ---

async function callGemini(prompt: string, apiKey?: string): Promise<LLMResponse> {
  const key = apiKey || env.GOOGLE_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_API_KEY");
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    return { text: response.text(), model: 'Gemini 2.5 Flash' };
  } catch (error) {
    const detail = extractErrorMessage(error);
    throw new Error(
      `Gemini request failed: ${detail}. If you are in a restricted network, try DeepSeek/Qwen or configure proxy.`,
    );
  }
}

async function callDeepSeek(prompt: string, apiKey?: string): Promise<LLMResponse> {
  const key = apiKey || env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("Missing DEEPSEEK_API_KEY");

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ key }`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      stream: false
    })
  });

  if (!response.ok) throw new Error(`DeepSeek API Error: ${ response.status }`);
  const data = await response.json();
  return { text: data.choices[0].message.content, model: 'DeepSeek V3' };
}

async function callQwen(prompt: string, apiKey?: string): Promise<LLMResponse> {
  // Qwen via Alibaba DashScope (OpenAI Compatible)
  const key = apiKey || env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("Missing DASHSCOPE_API_KEY");

  const model = env.DASHSCOPE_MODEL_ID || 'qwen-plus';

  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ key }`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) throw new Error(`Qwen API Error: ${ response.status }`);
  const data = await response.json();
  return { text: data.choices[0].message.content, model: `Qwen (${ model })` };
}

async function callDoubao(prompt: string, apiKey?: string): Promise<LLMResponse> {
  // Doubao via DOUBAO (OpenAI Compatible)
  const key = apiKey || env.DOUBAO_API_KEY;
  if (!key || !env.DOUBAO_ENDPOINT_ID_TEXT) throw new Error("Missing DOUBAO credentials");

  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ key }`
    },
    body: JSON.stringify({
      model: env.DOUBAO_ENDPOINT_ID_TEXT,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) throw new Error(`Doubao API Error: ${ response.status }`);
  const data = await response.json();
  return { text: data.choices[0].message.content, model: 'Doubao' };
}

async function callZhipu(prompt: string, apiKey?: string): Promise<LLMResponse> {
  const key = apiKey || env.ZHIPU_API_KEY;
  if (!key) throw new Error("Missing ZHIPU_API_KEY");

  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ key }`
    },
    body: JSON.stringify({
      model: 'glm-4-plus',
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) throw new Error(`Zhipu API Error: ${ response.status }`);
  const data = await response.json();
  return { text: data.choices[0].message.content, model: 'GLM-4 Plus' };
}

async function callOpenAI(prompt: string, apiKey?: string): Promise<LLMResponse> {
  const key = apiKey || env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY");

  const model = env.OPENAI_MODEL_ID || 'gpt-4o';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ key }`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) throw new Error(`OpenAI API Error: ${ response.status }`);
  const data = await response.json();
  return { text: data.choices[0].message.content, model: `OpenAI (${ model })` };
}

// --- Main Router ---

export async function generateRoast(prompt: string, apiKeys?: ApiKeys): Promise<LLMResponse> {
  const providers: Array<{ name: string, fn: (p: string, k?: string) => Promise<LLMResponse>, key?: string }> = [];

  // Add providers if they have a key either in env or provided by user
  if (env.GOOGLE_API_KEY || apiKeys?.google) providers.push({ name: 'Gemini', fn: callGemini, key: apiKeys?.google });
  if (env.DEEPSEEK_API_KEY || apiKeys?.deepseek) providers.push({ name: 'DeepSeek', fn: callDeepSeek, key: apiKeys?.deepseek });
  if (env.DASHSCOPE_API_KEY || apiKeys?.qwen) providers.push({ name: 'Qwen', fn: callQwen, key: apiKeys?.qwen });
  if ((env.DOUBAO_API_KEY || apiKeys?.doubao) && env.DOUBAO_ENDPOINT_ID_TEXT) providers.push({ name: 'Doubao', fn: callDoubao, key: apiKeys?.doubao });
  if (env.ZHIPU_API_KEY || apiKeys?.zhipu) providers.push({ name: 'Zhipu', fn: callZhipu, key: apiKeys?.zhipu });
  if (env.OPENAI_API_KEY || apiKeys?.chatgpt) providers.push({ name: 'OpenAI', fn: callOpenAI, key: apiKeys?.chatgpt });

  if (providers.length === 0) {
    throw new Error('未配置大模型提供商。请选择大模型并输入对应的 API Key，或在服务器上设置 API Key。');
  }

  // Prefer user-provided providers first.
  const userProviders = providers.filter(p => p.key);
  const pool = userProviders.length > 0 ? userProviders : providers;
  const serverOnlyProviders = providers.filter(p => !p.key);

  const orderedPool = [...pool].sort(() => Math.random() - 0.5);
  const selected = orderedPool[0];
  console.log(`[LLM] Selected Provider: ${ selected.name } ${ selected.key ? '(User Key)' : '(Server Key)' }`);

  try {
    return await selected.fn(prompt, selected.key);
  } catch (error) {
    console.error(`[LLM] Provider ${ selected.name } failed:`, extractErrorMessage(error));

    // 1) Fallback inside same preferred pool
    for (const backup of orderedPool.slice(1)) {
      try {
        console.log(`[LLM] Falling back to: ${ backup.name }`);
        return await backup.fn(prompt, backup.key);
      } catch (backupError) {
        console.error(`[LLM] Provider ${ backup.name } failed:`, extractErrorMessage(backupError));
      }
    }

    // 2) If user-provided provider(s) all fail, try server providers as last resort
    if (userProviders.length > 0 && serverOnlyProviders.length > 0) {
      for (const backup of serverOnlyProviders) {
        try {
          console.log(`[LLM] Falling back to server provider: ${ backup.name }`);
          return await backup.fn(prompt, backup.key);
        } catch (backupError) {
          console.error(`[LLM] Server provider ${ backup.name } failed:`, extractErrorMessage(backupError));
        }
      }
    }

    throw new Error(`All configured LLM providers failed. Last error: ${ extractErrorMessage(error) }`);
  }
}
