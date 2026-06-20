# 📖 Pali Docs - A documentation site for Pali language

> **"การเรียนรู้ไม่ควรถูกจำกัดด้วยตำรา แต่ควรเปิดกว้างด้วยเทคโนโลยี"**

ในปัจจุบัน การเรียนรู้ภาษาบาลียังคงพึ่งพาตำราและหนังสือเรียนเป็นหลัก ซึ่งแม้จะเต็มเปี่ยมไปด้วยคุณค่าทางวิชาการที่ล้ำค่า แต่ก็มาพร้อมกับข้อจำกัดหลายประการ ไม่ว่าจะเป็นความไม่สะดวกในการพกพา การค้นหาข้อมูลเฉพาะจากเอกสารที่มีปริมาณมหาศาลซึ่งต้องใช้เวลาและความพยายามอย่างมาก แม้จะมีการแปลงเนื้อหาเป็นไฟล์ดิจิทัลอย่าง PDF แล้วก็ตาม แต่ปัญหาในการสืบค้นก็ยังคงเป็นอุปสรรคสำคัญสำหรับผู้ศึกษาจำนวนไม่น้อย

ในยุคที่เทคโนโลยีเข้ามาเปลี่ยนวิถีชีวิต การนำเสนอเนื้อหาการเรียนภาษาบาลีในรูปแบบดิจิทัล จึงเป็นคำตอบที่ทันสมัยและตอบโจทย์ความต้องการของผู้เรียนในปัจจุบัน โปรเจกต์ **"Palidocs"** จึงมีขึ้นเพื่อเป็นสะพานเชื่อมระหว่างองค์ความรู้ดั้งเดิมกับนวัตกรรมใหม่ๆ โดยมีเป้าหมายหลักในการสร้างแพลตฟอร์มการเรียนบาลีไวยากรณ์ออนไลน์ที่ใช้งานง่าย สะดวกต่อการทบทวนและสืบค้นข้อมูล เพื่อให้ผู้เรียนสามารถเข้าถึงการศึกษาได้อย่างไร้ขีดจำกัดด้านเวลาและสถานที่.

#### 📌 เนื้อหาครอบคลุมบาลีไวยากรณ์ ๔ ภาค ดังนี้:
- **อักขรวิธี** - ว่าด้วยอักษร จัดเป็น ๒ คือ สมัญญาภิธาน ๑ สนธิ ๑.
- **วจีวิภาค** - แบ่งคำพูดออกเป็น ๖ ส่วน คือ นาม ๑ อัพยยศัพท์ ๑ สมาส ๑ ตัทธิต ๑ อาขยาต ๑ กฤต ๑.
- **วากยสัมพันธ์** - ว่าด้วยการก และประพันธ์ผูกคำพูดที่แบ่งไว้ในวจีวิภาคให้เข้าเป็นประโยคอันเดียวกัน.
- **ฉันทลักษณะ** - แสดงวิธีแต่งฉันท์ คือคาถาที่เป็นวรรณพฤทธิ์และมาตราพฤทธิ์.

#### ✨ วัตถุประสงค์:

* **เรียนภาษาบาลีได้ทุกที่ทุกเวลา:** <br/>
  บอกลาหนังสือเรียนเล่มหนา! เข้าถึงบทเรียนภาษาบาลีที่ครบถ้วนได้จากทุกอุปกรณ์ ไม่ว่าจะบนมือถือระหว่างพักกลางวันหรือบนแล็ปท็อปตอนดึก ๆ
* **หลักสูตรที่สมบูรณ์และค้นหาได้ง่าย:** <br/>
  ตั้งแต่ **ไวยากรณ์** พื้นฐาน **วากยสัมพันธ์** ไปจนถึง **ฉันทลักษณ์** มีครบทุกอย่างในรูปแบบที่จัดระเบียบอย่างสวยงามและค้นหาได้ง่าย
* **ค้นหาได้เร็วปานสายฟ้าแลบ:** <br/>
  ขับเคลื่อนด้วย Algolia ค้นหาสิ่งที่คุณต้องการได้ในเสี้ยววินาที ไม่ต้องพลิกหน้ากระดาษเป็นร้อย ๆ อีกต่อไป

## The Vision

We believe learning shouldn't be limited by textbooks but should be opened up through technology. Pali Docs bridges the gap between traditional scholarship and modern innovation, making ancient wisdom accessible to everyone, everywhere.


#### 🎯 Perfect For:

- **Students** diving into Pali studies
- **Scholars** needing quick reference materials
- **Anyone curious** about this beautiful ancient language
- **Self-learners** who prefer flexible, on-demand education

#### ✨ Objective:

* **Learn Pali Anywhere, Anytime:** Access comprehensive Pali lessons from any device. Ditch the heavy textbooks and study on your phone or laptop whenever you want.
* **Complete & Searchable Curriculum:** From **grammar** to **sentence structure** and **prosody**, we've got you covered. Find exactly what you need in a beautifully organized, searchable format.
* **Lightning-Fast Search:** Find what you're looking for in milliseconds with our Algolia-powered search. No more flipping through hundreds of pages.


## 🖼️ Screenshot:

![screenshot](/public/Screenshot.png)

## Explore

In the project, you can see:

- `lib/source.ts`: Code for content source adapter, [`loader()`](https://fumadocs.dev/docs/headless/source-api) provides the interface to access your content.
- `app/layout.config.tsx`: Shared options for layouts, optional but preferred to keep.

| Route                     | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `app/(home)`              | The route group for your landing page and other pages. |
| `app/docs`                | The documentation layout and pages.                    |
| `app/api/question/route.ts` | The RAG chat API (LLM + vector search)        |
| `app/api/search/route.ts` | The Route Handler for search.                          |
| `app/api/quiz/route.ts`   | The quiz generation API.                               |

### Fumadocs MDX

A `source.config.ts` config file has been included, you can customise different options like frontmatter schema.

Read the [Introduction](https://fumadocs.dev/docs/mdx) for further details.

## 🏗️ Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── (home)/            # Landing page & route groups
│   ├── api/               # API routes (search, question, quiz)
│   │   ├── question/      # RAG-powered chat endpoint
│   │   └── search/        # Algolia search endpoint
│   └── docs/              # Documentation layout & pages
├── components/
│   ├── ui/                # Reusable UI primitives (Button, Card, etc.)
│   └── ai/                # AI chat components (AIMessage, TaskStep, etc.)
├── lib/
│   ├── services/          # Business logic (RAG pipeline, search, embeddings)
│   ├── schemas/           # Zod validation schemas
│   ├── chat/              # System prompts & chat utilities
│   └── hooks/             # Domain-specific hooks
├── hooks/                 # Top-level app hooks (useAIChat, useQuiz)
├── helpers/               # Pure utility functions
├── actions/               # Server actions
├── data/                  # Static data (nav, quiz topics, content tree)
├── providers/             # Root-level providers (theme, Fumadocs)
├── tests/                 # All Vitest test files
└── content/
    ├── docs/              # MDX documentation content
    └── blog/              # MDX blog content
```

## 🤖 RAG Chat Workflow

The AI chat at `POST /api/question` uses a **Retrieval-Augmented Generation (RAG)** pipeline to answer Pali language questions with relevant textbook context.

```
User Message
    │
    ▼
LLM decides to search ──► searchDocs tool
    │                           │
    │                     generateEmbedding(query)
    │                           │
    │                     queryPinecone(vector, topK=5)
    │                           │
    │                     formatContext(matches)
    │                           │
    ▼                           ▼
prepareStep injects context into system prompt
    │
    ▼
LLM continues with retrieved context
    │
    ▼
generateSuggestions (3 follow-up questions)
    │
    ▼
Streaming response to client
```

**Key components:**
- **`app/api/question/route.ts`** — Route handler orchestrating the stream
- **`lib/services/rag-pipeline.ts`** — `searchDocuments()` (embed → query → format)
- **`lib/services/vector-store.ts`** — Pinecone query & context formatting
- **`lib/services/embedding.ts`** — Text embedding via Pinecone inference (LRU-cached)
- **`lib/services/suggestions.ts`** — Follow-up question generation via structured LLM output
- **`lib/chat/pali-system-prompt.ts`** — Pali expert role definition

> See [`docs/QUIZ-WORKFLOW.md`](./docs/QUIZ-WORKFLOW.md) for the quiz generation pipeline (topic selection → vector retrieval → LLM → timer → scoring).

## 🚀 Implementation Guide for Contributors

### 1. Getting Started with Accounts

Before contributing to the AI/RAG features, you'll need accounts for these services:

| Service | Purpose | How to Get |
|---------|---------|------------|
| **Pinecone** | Vector database for RAG document retrieval | Sign up at [pinecone.io](https://www.pinecone.io) → Create an index (dimension: `1024`, metric: `cosine`) → Copy API key & index name |
| **OpenRouter** | LLM API gateway (one key for many models) | Sign up at [openrouter.ai](https://openrouter.ai) → Create API key → Add $5+ credit |
| **Algolia** | Full-text search for documentation pages | Sign up at [algolia.com](https://www.algolia.com) → Create an app → Get search & admin API keys |

### 2. Dataset & Vector Database Setup

The Pinecone vector store must be populated with Pali textbook content before the RAG chat can retrieve relevant passages.

**Option A — From HuggingFace Dataset:**
```
1. Find or prepare a Pali textbook dataset on HuggingFace
2. Write a script to load the dataset:
   from datasets import load_dataset
   dataset = load_dataset("your-org/pali-textbooks")
3. Extract text content from the dataset entries
```

**Option B — From Local MDX Content (current approach):**
```
The project uses Fumadocs MDX files in content/docs/ as the source.
The static.json endpoint (app/static.json/route.ts) extracts structured
content at build time, which feeds the Algolia index. For Pinecone,
you need a separate upsert script.
```

### 3. Data Processing Pipeline

Once you have raw text, process it through these stages:

```
Raw Text → Clean → Chunk → Embed → Upsert to Pinecone
```

**a) Cleaning** — Remove irrelevant formatting, normalize whitespace, handle Thai/Pali characters:
```
- Strip HTML/markdown artifacts
- Normalize Unicode (NFKC for Thai/Pali)
- Remove empty or near-empty segments
```

**b) Chunking** — Split documents into searchable chunks:
```
- Recommended: 500-1000 character chunks with 100-char overlap
- Use recursive character splitting (respect paragraph boundaries)
- Preserve document title/source metadata per chunk
- Library suggestion: LangChain's RecursiveCharacterTextSplitter
```

**c) Embedding** — Convert chunks to vectors:

| Model | Provider | Dimensions | Used For |
|-------|----------|------------|----------|
| `llama-text-embed-v2` | Pinecone Inference API | 1024 | RAG context retrieval |

```ts
// Embedding via Pinecone Inference API (see lib/services/embedding.ts)
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const result = await pc.inference.embed("llama-text-embed-v2", [text], {
  inputType: "passage",
  truncate: "END",
});
```

**d) Upsert to Pinecone** — Store vectors with metadata:
```ts
// Upsert vectors to your Pinecone index
await index.namespace("your-namespace").upsert([
  {
    id: "doc-1-chunk-0",
    values: embeddingVector,    // float[1024]
    metadata: {
      text: "original chunk text",
      source: "path/to/document",
      title: "Document Title",
    },
  },
]);
```

> **Note:** There is currently no built-in Pinecone upsert script in this repo. Contributors should create one following the pattern above, using the same embedding model (`llama-text-embed-v2`) to ensure query embeddings are compatible.

### 4. LLM Models Used

| Feature | Model (default) | Provider | Fallback |
|---------|-----------------|----------|----------|
| **RAG Chat** | `google/gemma-4-31b-it:free` | OpenRouter | Any OpenAI-compatible model via `LLM_MODEL` env var |
| **Quiz Generation** | `google/gemma-4-31b-it:free` | OpenRouter | Configurable via `LLM_MODEL` |
| **Follow-up Suggestions** | Same as `LLM_MODEL` | OpenRouter | — |

Set `LLM_MODEL` in your `.env.local` to override the default for chat and suggestions.

### 5. Environment Setup

Copy `.env.example` (or create `.env.local`) with:

```env
# Pinecone (vector database)
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=pali-docs
PINECONE_NAMESPACE=textbooks

# OpenRouter (LLM gateway — also used as PROVIDER_API_KEY)
OPENAI_API_KEY=sk-or-v1-...
# or set explicitly:
PROVIDER_API_KEY=sk-or-v1-...

# Optional: override the default LLM model
LLM_MODEL=google/gemma-4-31b-it:free

# Algolia (full-text search)
NEXT_PUBLIC_ALGOLIA_APP_ID=...
NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY=...
ALGOLIA_API_KEY=...              # admin key for indexing
ALGOLIA_INDEX_NAME=pali_docs
```

### 6. Running the Indexing

```bash
# Build the project first (generates static.json)
npm run build

# Sync content to Algolia
npm run index

# For Pinecone: run your upsert script (see section 3d above)
node scripts/upsert-pinecone.mjs
```

### 7. Development

```bash
npm run dev      # Start dev server with Turbopack
npm test         # Run all tests in watch mode
npm run test:run # Run all tests once
npx vitest run tests/route.test.ts  # Single test
```

## Learn More

To learn more about Next.js and Fumadocs, take a look at the following
resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js
  features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Fumadocs](https://fumadocs.vercel.app) - learn about Fumadocs
