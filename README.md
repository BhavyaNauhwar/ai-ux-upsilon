# Upsilon AI

A full-featured AI chatbot web application with long-term memory, file attachments, chat history, and authentication.

## Features

- 💬 Real-time AI chat with streaming responses
- 🧠 Long-term memory system (stored in Supabase)
- 📎 File & image attachments
- 📁 Persistent chat history (Supabase + localStorage fallback)
- 🔐 Authentication via Supabase Auth
- 👤 Guest mode (limited credits) and paid full-access mode
- ✍️ AI-generated chat titles
- 🎨 Appearance customisation (dark/light mode, fonts)
- 💻 Code syntax highlighting in AI responses

## Tech Stack

- **Frontend:** React + TypeScript + TanStack Start (Vite)
- **Styling:** Tailwind CSS + shadcn/ui
- **Backend/SSR:** TanStack Start server functions
- **Database & Auth:** Supabase (PostgreSQL + Supabase Auth)
- **AI Providers:** Groq (default) · Gemini · OpenAI · OpenRouter

## Getting Started

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd <project-folder>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** in your project and run the contents of [`supabase_schema.sql`](./supabase_schema.sql) to create all required tables and policies
3. Copy your **Project URL** and **anon/public key** from **Settings → API**

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your own values:

```env
# Required — at least one AI provider
GROQ_API_KEY=your_groq_api_key_here          # https://console.groq.com
PAID_GROQ_API_KEY=your_paid_groq_api_key_here

# Required — Supabase
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Optional additional providers
GEMINI_API_KEY=your_gemini_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Which AI provider to use for paid/full-access users
# Options: groq-paid | gemini | openai | openrouter
AI_PROVIDER=groq-paid
```

> ⚠️ **Never commit your `.env` file.** It is listed in `.gitignore`. Only commit `.env.example`.

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:8080](http://localhost:8080).

## Deployment

Build the production bundle:

```bash
npm run build
```

This project is configured for **Cloudflare Workers** deployment via Wrangler. Set your environment variables as Worker secrets rather than in `.env`.

## Project Structure

```
src/
├── lib/
│   ├── supabase.ts      # Supabase client + all DB helpers
│   ├── gemini.ts        # AI provider functions (Groq, Gemini, OpenAI, OpenRouter)
│   └── appearance.tsx   # Theme/appearance settings
├── routes/
│   ├── index.tsx        # Main chat UI (all components)
│   └── __root.tsx       # Root layout + metadata
└── server.ts            # Server entry — AI provider routing
supabase_schema.sql      # Run this in Supabase SQL Editor
.env.example             # Copy to .env and fill in your values
```

## License

MIT
