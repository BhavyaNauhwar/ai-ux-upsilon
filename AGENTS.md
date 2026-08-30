# Agent Guidelines

When working on this codebase, follow these guidelines:

- Keep the existing architecture intact — do not redesign the UI or rewrite working systems
- Never hardcode API keys or secrets — always use environment variables
- The `.env` file must never be committed — use `.env.example` for templates
- Supabase integration is in `src/lib/supabase.ts` — all DB calls go through that file
- AI provider routing is in `src/server.ts` and `src/lib/gemini.ts`
- The main chat UI is in `src/routes/index.tsx`
