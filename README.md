# Upsilon AI

Upsilon AI is an open-source, full-stack AI chatbot application designed for modern conversational work and configurable backend integrations. It combines a polished chat interface with authentication, persistent history, long-term memory, attachments, and a flexible AI backend architecture that can be adapted to a developer's deployment.

## Overview

This project provides a ChatGPT-style AI chat experience in a reusable application foundation. It is built for developers who want a clean open-source interface with authenticated and guest flows, persistent chat state, and the ability to connect the app to their own AI service configuration.

The app is intentionally designed to remain provider-agnostic at the product level: the UI and experience are the focus, while the underlying AI backend remains configurable for each deployment.

## Features

- Real-time AI conversations with streaming responses
- Multi-turn chat experience
- Guest Mode for limited unauthenticated access
- Authenticated full-access experience
- Persistent chat history
- Long-term memory support
- File, image, and PDF attachments where supported by the configured environment
- AI-generated chat titles
- Markdown rendering and code syntax highlighting
- Light/dark theme customization
- Responsive interface for desktop and mobile use
- Local persistence fallback when needed

## Architecture

### Frontend

- React
- TypeScript
- TanStack Start
- Vite
- Tailwind CSS

### Backend and data

- Server-side request handling through the app's backend entrypoints
- Supabase for authentication, PostgreSQL-backed persistence, and storage integration
- localStorage fallback for unauthenticated or offline-friendly state

### AI backend

Upsilon AI uses a configurable server-side AI backend architecture. Developers can connect the application to the AI service or model configuration appropriate for their deployment without changing the public-facing identity of the application.

## Guest Mode

Guest Mode allows visitors to try the application without creating an account. It is designed for lightweight, limited access so developers can offer a demo or a lower-friction testing experience while keeping the full application architecture intact.

## Full-Access / Authenticated Mode

Authenticated users can access the full application experience, including persistent conversations, long-term memory, attachments, and a richer backend configuration. The same conversation interface is preserved while the underlying application configuration changes based on the user's access state.

## Long-Term Memory

Upsilon AI includes long-term memory support so the application can retain relevant user-provided information across conversations when memory is enabled and configured. Memory is stored through the project's configured persistence layer and remains part of the application’s stateful chat experience.

## Chat Persistence

The application keeps chat history available across sessions using local persistence and authenticated cloud persistence where Supabase is configured. This allows users to restore earlier conversations without losing the experience across reloads or sign-ins.

## Attachments

The app supports file and media attachments, including image and PDF handling where the deployment environment and configured integrations support them. Attachment handling is designed to fit within the larger chat experience without requiring a redesign of the core interface.

## Setup

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd <project-folder>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure Supabase

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run [`supabase_schema.sql`](./supabase_schema.sql) in the Supabase SQL editor
3. Copy your project URL and anonymous/public key
4. Configure any storage or table settings required for your deployment

### 4. Configure environment variables

```bash
cp .env.example .env
```

Then provide the local values required for your deployment, including your Supabase configuration and the AI backend credentials or settings your environment requires.

> `.env` is for local development only and must not be committed. Use `.env.example` as the safe template for required configuration.

### 5. Run locally

```bash
npm run dev
```

### 6. Build for production

```bash
npm run build
```

## Environment Variables

The repository includes a safe local template in [`.env.example`](./.env.example). Copy this file to `.env` and fill in the values required by your own deployment.

Important rules:

- `.env` is local/private and should never be committed
- use `.env.example` as the safe public template
- in production, store secrets in your platform's environment management system
- never check real credentials into source control

## Project Structure

```text
src/
├── lib/
│   ├── appearance.tsx   # Theme and settings logic
│   ├── gemini.ts        # Backend AI integration layer
│   ├── supabase.ts      # Supabase client and persistence helpers
│   └── utils.ts         # Shared utilities
├── routes/
│   ├── __root.tsx       # Root layout and app shell
│   └── index.tsx        # Main chat UI and application flow
├── styles.css           # Global styles
├── server.ts            # Server entry and route handling
├── routeTree.gen.ts     # Generated route tree
public/
├── favicon.ico
├── favicon.svg
supabase_schema.sql      # Supabase schema for the app
.env.example             # Local configuration template
.gitignore               # Ignores secrets and generated local files
README.md                # Project overview and setup instructions
package.json             # Scripts and dependencies
```

## Deployment

Upsilon AI is intended to be self-hosted and configured for your own deployment environment. Production deployments should use secure secret management and environment variables rather than storing credentials in the repository.

The app is designed to be customizable without requiring a single vendor or cloud product as the public-facing identity.

## Known Limitations

This project is a functional open-source AI chatbot foundation, but it is not a complete production SaaS product out of the box. Some configuration depends on the environment in which it is deployed.

Current considerations include:

- deployment-specific AI backend configuration
- Supabase project setup and policies
- storage and attachment configuration for real-world deployments
- environment-specific secret management

Image generation is not included as a built-in feature in this repository.

## Open Source

Upsilon AI is meant to be a reusable open-source foundation for developers who want to:

- self-host the application
- customize the interface and user experience
- connect their own AI backend
- configure Supabase for auth and persistence
- extend the platform for experiments, internal tooling, or custom chat workflows

## Security

- Never commit `.env` files
- Never expose server-side AI credentials to the browser
- Use platform-managed secrets in production
- Configure Supabase Row-Level Security policies appropriately for your deployment

## License

MIT
