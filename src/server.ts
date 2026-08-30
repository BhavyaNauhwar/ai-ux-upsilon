import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { generateGroqResponse, generateGeminiResponse, generateOpenRouterResponse, generateOpenAiResponse, generatePaidGroqResponse, getAiProvider } from "./lib/gemini";
type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

async function handleGroqRequest(request: Request, env: unknown): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      prompt?: string;
      messages?: Array<{ role: string; content: string; attachments?: Array<{ mimeType: string; data: string; name?: string }> }>;
    } | null;
    let messages = body?.messages;
    if (!messages && typeof body?.prompt === "string") {
      messages = [{ role: "user", content: body.prompt.trim() }];
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Missing messages or prompt" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    try {
      const isGuest = messages.some(m => m.role === "system" && m.content.includes("Guest/Test Mode"));
      const aiProvider = getAiProvider(env);
      
      // Log provider selection for debugging (never log actual keys)
      console.log(`[AI Router] isGuest=${isGuest} provider=${aiProvider ?? "gemini(default)"}`);

      let text: string;
      if (isGuest) {
        console.log("[AI Router] → Groq (guest)");
        text = await generateGroqResponse(messages, env);
      } else if (aiProvider === "groq-paid") {
        console.log("[AI Router] → Groq (paid/full-access)");
        text = await generatePaidGroqResponse(messages, env);
      } else if (aiProvider === "openai") {
        console.log("[AI Router] → OpenAI (official)");
        text = await generateOpenAiResponse(messages, env);
      } else if (aiProvider === "openrouter") {
        console.log("[AI Router] → OpenRouter");
        text = await generateOpenRouterResponse(messages, env);
      } else {
        console.log("[AI Router] → Gemini (default)");
        text = await generateGeminiResponse(messages, env);
      }

      return new Response(JSON.stringify({ text }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch (error) {
      console.error("AI request failed", error);
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  } catch (error) {
    console.error("Gemini request failed", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/gemini") {
      return handleGroqRequest(request, env);
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
