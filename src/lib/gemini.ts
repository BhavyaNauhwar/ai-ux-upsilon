import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return acc;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) return acc;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (key) {
        acc[key] = value.replace(/^['"]|['"]$/g, "");
      }
      return acc;
    }, {});
}

function getApiKey(env: unknown): string | undefined {
  if (typeof env === "object" && env !== null) {
    const candidate = env as Record<string, unknown>;
    if (typeof candidate.GROQ_API_KEY === "string" && candidate.GROQ_API_KEY.trim()) {
      return candidate.GROQ_API_KEY.trim();
    }
  }

  if (typeof process !== "undefined" && typeof process.env?.GROQ_API_KEY === "string") {
    return process.env.GROQ_API_KEY.trim();
  }

  const envFile = parseEnvFile(join(process.cwd(), ".env"));
  const envFileValue = envFile.GROQ_API_KEY?.trim();
  return envFileValue || undefined;
}

function getGeminiApiKey(env: unknown): string | undefined {
  if (typeof env === "object" && env !== null) {
    const candidate = env as Record<string, unknown>;
    if (typeof candidate.GEMINI_API_KEY === "string" && candidate.GEMINI_API_KEY.trim()) {
      return candidate.GEMINI_API_KEY.trim();
    }
  }

  if (typeof process !== "undefined" && typeof process.env?.GEMINI_API_KEY === "string") {
    return process.env.GEMINI_API_KEY.trim();
  }

  const envFile = parseEnvFile(join(process.cwd(), ".env"));
  const envFileValue = envFile.GEMINI_API_KEY?.trim();
  return envFileValue || undefined;
}

export function getAiProvider(env: unknown): string | undefined {
  if (typeof env === "object" && env !== null) {
    const candidate = env as Record<string, unknown>;
    if (typeof candidate.AI_PROVIDER === "string" && candidate.AI_PROVIDER.trim()) {
      const val = candidate.AI_PROVIDER.trim().toLowerCase();
      console.log(`[getAiProvider] from env object: ${val}`);
      return val;
    }
  }

  if (typeof process !== "undefined" && typeof process.env?.AI_PROVIDER === "string") {
    const val = process.env.AI_PROVIDER.trim().toLowerCase();
    console.log(`[getAiProvider] from process.env: ${val}`);
    return val;
  }

  const envFile = parseEnvFile(join(process.cwd(), ".env"));
  const envFileValue = envFile.AI_PROVIDER?.trim().toLowerCase();
  console.log(`[getAiProvider] from .env file (cwd=${process.cwd()}): ${envFileValue ?? "undefined"}`);
  return envFileValue || undefined;
}

function getPaidGroqApiKey(env: unknown): string | undefined {
  if (typeof env === "object" && env !== null) {
    const candidate = env as Record<string, unknown>;
    if (typeof candidate.PAID_GROQ_API_KEY === "string" && candidate.PAID_GROQ_API_KEY.trim()) {
      return candidate.PAID_GROQ_API_KEY.trim();
    }
  }

  if (typeof process !== "undefined" && typeof process.env?.PAID_GROQ_API_KEY === "string") {
    return process.env.PAID_GROQ_API_KEY.trim();
  }

  const envFile = parseEnvFile(join(process.cwd(), ".env"));
  const envFileValue = envFile.PAID_GROQ_API_KEY?.trim();
  return envFileValue || undefined;
}

export async function generatePaidGroqResponse(messages: Array<{ role: string; content: string | Array<{ type?: string; text?: string; image_url?: { url: string } }> }>, env: unknown): Promise<string> {
  const apiKey = getPaidGroqApiKey(env);

  if (!apiKey) {
    throw new Error("Missing PAID_GROQ_API_KEY — cannot serve paid/full-access request via Groq");
  }

  const model = (typeof process !== "undefined" && typeof process.env?.GROQ_MODEL === "string"
    ? process.env.GROQ_MODEL
    : DEFAULT_MODEL) || DEFAULT_MODEL;

  console.log(`[Paid Groq] model=${model} PAID_GROQ_API_KEY present: true`);

  // Groq does not support image vision in the same way — strip image parts and send text only
  const textMessages = messages.map(m => ({
    role: m.role,
    content: typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content)
        ? m.content.filter(p => p.type === "text").map(p => p.text ?? "").join("").trim() || "[attachment]"
        : String(m.content),
  }));

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: textMessages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Paid Groq request failed (${response.status}): ${detail || response.statusText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part) => part.text ?? "").join("").trim()
      : "";

  if (!text) {
    throw new Error("Paid Groq returned an empty response");
  }

  return text;
}

function getOpenRouterApiKey(env: unknown): string | undefined {
  if (typeof env === "object" && env !== null) {
    const candidate = env as Record<string, unknown>;
    if (typeof candidate.OPENROUTER_API_KEY === "string" && candidate.OPENROUTER_API_KEY.trim()) {
      return candidate.OPENROUTER_API_KEY.trim();
    }
  }

  if (typeof process !== "undefined" && typeof process.env?.OPENROUTER_API_KEY === "string") {
    return process.env.OPENROUTER_API_KEY.trim();
  }

  const envFile = parseEnvFile(join(process.cwd(), ".env"));
  const envFileValue = envFile.OPENROUTER_API_KEY?.trim();
  return envFileValue || undefined;
}

function getOpenAiApiKey(env: unknown): string | undefined {
  if (typeof env === "object" && env !== null) {
    const candidate = env as Record<string, unknown>;
    if (typeof candidate.OPENAI_API_KEY === "string" && candidate.OPENAI_API_KEY.trim()) {
      return candidate.OPENAI_API_KEY.trim();
    }
  }

  if (typeof process !== "undefined" && typeof process.env?.OPENAI_API_KEY === "string") {
    return process.env.OPENAI_API_KEY.trim();
  }

  const envFile = parseEnvFile(join(process.cwd(), ".env"));
  const envFileValue = envFile.OPENAI_API_KEY?.trim();
  return envFileValue || undefined;
}

export async function generateGroqResponse(messages: Array<{ role: string; content: string }>, env: unknown): Promise<string> {
  const apiKey = getApiKey(env);

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const model = (typeof process !== "undefined" && typeof process.env?.GROQ_MODEL === "string"
    ? process.env.GROQ_MODEL
    : DEFAULT_MODEL) || DEFAULT_MODEL;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Groq request failed (${response.status}): ${detail || response.statusText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part) => part.text ?? "").join("").trim()
      : "";

  if (!text) {
    throw new Error("Groq returned an empty response");
  }

  return text;
}

export async function generateGeminiResponse(
  messages: Array<{ role: string; content: string; attachments?: Array<{ mimeType: string; data: string }> }>,
  env: unknown
): Promise<string> {
  const apiKey = getGeminiApiKey(env);

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const systemMessages = messages.filter(m => m.role === "system").map(m => m.content).join("\n");
  const history = messages.filter(m => m.role !== "system");

  const contents = history.map(m => {
    const parts: any[] = [];
    if (m.attachments && Array.isArray(m.attachments)) {
      for (const att of m.attachments) {
        if (att.mimeType && att.data) {
          parts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: att.data,
            },
          });
        }
      }
    }
    if (m.content) {
      parts.push({ text: m.content });
    } else if (parts.length === 0) {
      parts.push({ text: " " });
    }

    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  const body: any = { contents };
  if (systemMessages) {
    body.system_instruction = { parts: [{ text: systemMessages }] };
  }

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${detail || response.statusText}`);
  }

  const payload = (await response.json()) as any;
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return typeof text === "string" ? text.trim() : "";
}

export async function generateOpenRouterResponse(
  messages: Array<{ role: string; content: string; attachments?: Array<{ mimeType: string; data: string }> }>,
  env: unknown
): Promise<string> {
  const apiKey = getOpenRouterApiKey(env);

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  const openRouterMessages = messages.map(m => {
    // OpenAI/OpenRouter vision format for attachments
    if (m.attachments && m.attachments.length > 0) {
      const contentParts: any[] = [];
      if (m.content) {
        contentParts.push({ type: "text", text: m.content });
      } else {
        contentParts.push({ type: "text", text: " " });
      }
      
      for (const att of m.attachments) {
        if (att.mimeType && att.data) {
          const url = att.data.startsWith("http") || att.data.startsWith("data:") 
            ? att.data 
            : `data:${att.mimeType};base64,${att.data}`;
            
          contentParts.push({
            type: "image_url",
            image_url: { url }
          });
        }
      }
      return { role: m.role, content: contentParts };
    }
    
    return { role: m.role, content: m.content || " " };
  });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemma-4-26b-a4b-it:free",
      messages: openRouterMessages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenRouter request failed (${response.status}): ${detail || response.statusText}`);
  }

  const payload = (await response.json()) as any;
  const content = payload.choices?.[0]?.message?.content;
  
  const text = typeof content === "string"
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part: any) => part.text ?? "").join("").trim()
      : "";

  if (!text) {
    throw new Error("OpenRouter returned an empty response");
  }

  return text;
}

export async function generateOpenAiResponse(
  messages: Array<{ role: string; content: string; attachments?: Array<{ mimeType: string; data: string; name?: string }> }>,
  env: unknown
): Promise<string> {
  const apiKey = getOpenAiApiKey(env);

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const primaryModel = (typeof process !== "undefined" && typeof process.env?.OPENAI_MODEL === "string" && process.env.OPENAI_MODEL.trim())
    ? process.env.OPENAI_MODEL.trim()
    : "gpt-4o";

  const openAiMessages = messages.map((m) => {
    if (m.attachments && m.attachments.length > 0) {
      const contentParts: any[] = [];
      if (m.content) {
        contentParts.push({ type: "text", text: m.content });
      } else {
        contentParts.push({ type: "text", text: " " });
      }

      for (const att of m.attachments) {
        if (att.mimeType && att.data) {
          if (att.mimeType.startsWith("image/")) {
            const url = att.data.startsWith("http") || att.data.startsWith("data:")
              ? att.data
              : `data:${att.mimeType};base64,${att.data}`;

            contentParts.push({
              type: "image_url",
              image_url: { url },
            });
          } else {
            contentParts.push({
              type: "text",
              text: `[Attached file: ${att.name || "document"} (${att.mimeType})]`,
            });
          }
        }
      }
      return { role: m.role, content: contentParts };
    }

    return { role: m.role, content: m.content || " " };
  });

  const sendRequest = async (modelToUse: string) => {
    return await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: openAiMessages,
        temperature: 0.7,
      }),
    });
  };

  let response = await sendRequest(primaryModel);

  // If primary model isn't available or fails with a 404/model_not_found error, fallback to gpt-4o or gpt-4o-mini
  if (!response.ok && (primaryModel !== "gpt-4o" && primaryModel !== "gpt-4o-mini")) {
    const errorText = await response.clone().text().catch(() => "");
    if (response.status === 404 || errorText.includes("model_not_found")) {
      console.warn(`OpenAI model ${primaryModel} not available, falling back to gpt-4o`);
      response = await sendRequest("gpt-4o");
      if (!response.ok && response.status === 404) {
        console.warn("gpt-4o not available, falling back to gpt-4o-mini");
        response = await sendRequest("gpt-4o-mini");
      }
    }
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI request failed (${response.status}): ${detail || response.statusText}`);
  }

  const payload = (await response.json()) as any;
  const content = payload.choices?.[0]?.message?.content;

  const text = typeof content === "string"
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part: any) => part.text ?? "").join("").trim()
      : "";

  if (!text) {
    throw new Error("OpenAI returned an empty response");
  }

  return text;
}

