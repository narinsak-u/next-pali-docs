# Agent Guidelines for next-pali-docs

## Project Overview

This is a Next.js 15 documentation site for Pali language learning, using the App Router, TypeScript, Tailwind CSS v4, and Fumadocs for content management. The site features AI-powered chat, quiz functionality, and documentation rendering.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4, class-variance-authority (cva)
- **UI Components:** Radix UI primitives
- **Content:** Fumadocs + MDX
- **Search:** Algolia + Pinecone (vector search)
- **AI:** @ai-sdk/react, ai package, OpenAI-compatible models
- **Validation:** Zod schemas
- **Icons:** Lucide React

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Turbopack |
| `npm run build` | Build for production (runs `next build` then updates index) |
| `npm run start` | Start production server |
| `npm run index` | Run the search index update script |
| `npm run postinstall` | Auto-runs fumadocs-mdx after npm install |

**Note:** No test framework or lint commands are configured. Run `next build` for type checking.

## TypeScript Configuration

- Strict mode enabled
- Use `@/` path alias (e.g., `@/lib/utils`, `@/components/ui/button`)
- Use `.source` for content files (e.g., `@/.source` maps to `.source/index.ts`)
- Module resolution: `bundler`

## Code Style

### Imports
- Use `@/` for internal imports (project root)
- Use relative imports for sibling components in same directory
- Group imports: external libs → internal libs → components
- Use `type` keyword for type-only imports: `import { type SomeType }`

### Components
- Server components by default (no `"use client"` unless needed)
- Use `cva` (class-variance-authority) for variant styles
- Use `cn()` from `@/lib/utils` for className merging (wraps `clsx` + `tailwind-merge`)
- Prefix UI components with proper names (e.g., `Button`, not `Btn`)
- Extract complex client logic to separate `*.client.tsx` or `*Client.tsx` files
- Use Radix UI for accessible component primitives

### Naming
- PascalCase for components and types: `QuizTimer`, `SearchResult`
- camelCase for functions and variables: `getStats`, `userMessage`
- UPPER_SNAKE for constants: `MAX_RETRIES`, `API_BASE_URL`
- File naming: `page.tsx` (Next.js pages), `route.ts` (API routes), `*.client.tsx` (client components)

### Styling
- Use Tailwind CSS utility classes
- Use semantic colors from design tokens where possible
- Avoid arbitrary values; rely on design system
- Use inline styles only for dynamic values (e.g., CSS variables)
- Use `tw-animate-css` for animations when needed

### Error Handling
- Use `try/catch` with `console.error` for async operations
- Return proper error responses in API routes
- Use `react-error-boundary` for component-level error handling

### API Routes
- Use `runtime = "edge"` for Edge Runtime (see `app/api/chat/route.ts`)
- Parse request body with `await req.json()`
- Return streaming responses with `result.toUIMessageStreamResponse()`

### LLM/AI Integration
- Use `@ai-sdk/react` and `ai` package for AI features
- Define tool schemas with Zod (see `lib/chat/inkeep-qa-schema.ts`)
- Use `convertToModelMessages` for message formatting
- Support both OpenAI and OpenAI-compatible providers

## File Organization

```
app/                    # Next.js App Router pages
  (home)/              # Route group (no URL segment)
  api/                 # API routes (edge runtime)
  docs/                # Documentation pages
components/
  ui/                  # Reusable UI primitives (Button, Card, etc.)
  search/              # Search-related components
  ai/                  # AI/chat components
lib/                   # Utilities and client code
  schemas/             # Zod schemas
  chat/                # Chat-related utilities
data/                  # Static data files
helpers/               # Helper functions
actions/               # Server actions
source.config.ts       # Fumadocs content source config
site.config.ts         # Site configuration
```

## Content

- MDX files go in `.source/` directory
- Use Fumadocs frontmatter for metadata
- Reference content via `@/.source` alias

## Environment Variables

Required for search and AI features:
- `ALGOLIA_APP_ID`, `ALGOLIA_API_KEY`, `ALGOLIA_INDEX_NAME`
- `OPENAI_API_KEY` (or compatible LLM provider)
- `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`

Create `.env.local` for local development (do not commit).

## Design System

Follow `DESIGN.md` for all new component creation. This ensures consistency with the project's visual identity.

### Quick Reference

| Category | Usage |
|----------|-------|
| Colors | Use semantic tokens (`primary`, `secondary`, `muted`) — never hardcode hex |
| Typography | Geist (English), Thasadith 600 (Thai), IBM Plex Sans Thai (blog), Geist Mono (code) |
| Spacing | 4px base: xs=4, sm=8, md=16, lg=24, xl=32, 2xl=48 |
| Radius | Buttons: `rounded-md` (8px), Cards: `rounded-xl` (12px) |
| Shadows | `shadow` for cards, `shadow-md` for elevated surfaces |

### Component Checklist

When creating new UI components, ensure:

1. Use `cva` for variant styles (see `components/ui/button.tsx` pattern)
2. Use semantic color tokens from `--color-*` CSS variables
3. Apply correct border radius for component type
4. Use `cn()` for className merging
5. Set `data-slot` attribute for Radix compatibility
6. Support both light and dark modes
7. Add focus-visible states for accessibility

**Do:** Use design tokens, support dark mode, set `lang="th"` for Thai content

**Don't:** Hardcode colors, mix English/Thai fonts in same element, use arbitrary values

## Custom Skills

Project-specific skills in `.agents/skills/`:

- **fumadocs-content** - MDX content management, frontmatter, source config
- **quiz-engine** - Quiz state management, timer, pagination, results
- **search-indexing** - Algolia/Pinecone indexing pipeline, search API