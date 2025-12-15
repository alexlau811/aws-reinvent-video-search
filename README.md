# AWS re:Invent Video Search Platform

A client-side video search and discovery platform for AWS re:Invent conference videos using full-text search and metadata filtering.

## Features

- **Full-Text Search**: SQLite FTS5-powered keyword search across titles, descriptions, and transcripts
- **Rich Filtering**: Filter by technical level, AWS services, topics, session type, duration, and date
- **Offline Capable**: Works without internet after initial database load
- **Browse Mode**: Discover content by categories, topics, and AWS services
- **Mobile Responsive**: Optimized for all device sizes
- **Lightweight**: No external AI/embedding dependencies - pure regex/keyword extraction

## Architecture

The system consists of three main components:

1. **Data Pipeline** (`packages/data-pipeline`) - Server-side processing that:
   - Discovers AWS re:Invent videos using yt-dlp
   - Extracts transcripts from YouTube subtitles
   - Enriches metadata using keyword/regex patterns
   - Builds SQLite database with FTS5 full-text search

2. **Client Application** (`packages/client-app`) - Browser-based React app that:
   - Loads SQLite database via SQL.js WASM
   - Provides instant keyword search
   - Includes filtering and browsing interfaces
   - Works offline after initial load

3. **Shared Types** (`packages/shared`) - Common TypeScript interfaces

## Project Structure

```
├── packages/
│   ├── shared/           # Shared TypeScript types
│   ├── data-pipeline/    # Node.js data processing
│   └── client-app/       # React client application
├── package.json          # Root workspace configuration
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- yt-dlp (`pip install yt-dlp` or `brew install yt-dlp`)

### Installation

```bash
# Install dependencies
npm install

# Build all packages
npm run build
```

## Building the Database

To build/rebuild the video database, use the `build-database.ts` script:

```bash
cd packages/data-pipeline

# Build from AWS Events channel (re:Invent videos only)
npx tsx src/build-database.ts "https://www.youtube.com/@AWSEventsChannel"

# Build from a specific playlist
npx tsx src/build-database.ts "https://www.youtube.com/playlist?list=PLhr1KZpdzukcaA06WloeNmGlnM_f1LrdP"

# Limit number of videos processed
npx tsx src/build-database.ts "https://www.youtube.com/@AWSEventsChannel" --max 50

# Include ALL videos (not just re:Invent filtered)
npx tsx src/build-database.ts "https://www.youtube.com/@AWSEventsChannel" --all

# Custom output path
npx tsx src/build-database.ts "https://www.youtube.com/@AWSEventsChannel" ./my-database.db

# Adjust batch size for processing
npx tsx src/build-database.ts "https://www.youtube.com/@AWSEventsChannel" --batch 5
```

### Build Options

| Option | Description |
|--------|-------------|
| `--max <number>` | Limit the number of videos to process |
| `--all` | Include all videos (skip re:Invent filtering) |
| `--batch <number>` | Set batch size for processing (default: 10) |

The database is output to `packages/client-app/public/database/reinvent-videos.db` by default.

## Development

### Client Application

```bash
cd packages/client-app

# Start development server
npm run dev

# Build for production
npm run build
```

### Data Pipeline

```bash
cd packages/data-pipeline

# Build TypeScript
npm run build

# Type check
npm run type-check
```

## Technology Stack

### Data Pipeline
- **Node.js + TypeScript** - Runtime and type safety
- **yt-dlp** - YouTube video discovery and transcript extraction
- **Better SQLite3** - High-performance database operations
- **Regex-based extraction** - AWS service and topic detection

### Client Application
- **React + TypeScript** - UI framework
- **Vite** - Build tooling
- **SQL.js** - SQLite WASM for browser
- **Tailwind CSS** - Styling

### Database & Search
- **SQLite with FTS5** - Full-text search
- **Keyword matching** - Title, description, transcript search

## Metadata Extraction

The pipeline extracts metadata using keyword/regex patterns:

- **AWS Services**: Detects mentions of EC2, Lambda, S3, DynamoDB, etc.
- **Topics**: Identifies themes like Security, DevOps, Machine Learning, etc.
- **Technical Level**: Extracted from session codes (e.g., SEC301 → Advanced)
- **Session Type**: Inferred from content (Workshop, Keynote, Breakout, etc.)
- **Speakers**: Basic extraction from transcript patterns

## Deployment

### Build Production Client

```bash
cd packages/client-app
npm run build
```

Deploy the `dist/` folder to any static hosting:
- **Vercel**: `vercel --prod`
- **Netlify**: `netlify deploy --prod --dir=dist`
- **AWS S3**: Upload to S3 bucket with static hosting

## License

MIT License
