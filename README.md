# AWS re:Invent 2025 Video Search Platform

A client-side video search and discovery platform that enables users to search through AWS re:Invent 2025 conference videos using semantic search, keyword matching, and metadata filtering.

## Architecture

The system consists of two main components:

1. **Data Pipeline** (`packages/data-pipeline`) - Server-side processing that:
   - Monitors AWS Events Channel for new re:Invent 2025 videos
   - Scrapes official AWS metadata and extracts information from transcripts
   - Generates embeddings for semantic search
   - Updates SQLite database and deploys to CDN

2. **Client Application** (`packages/client-app`) - Browser-based React app that:
   - Downloads SQLite database from CDN
   - Provides instant search without server requests
   - Supports hybrid semantic and keyword search
   - Works offline after initial load

3. **Shared Types** (`packages/shared`) - Common TypeScript interfaces and utilities

## Project Structure

```
├── packages/
│   ├── shared/           # Shared TypeScript types and utilities
│   ├── data-pipeline/    # Node.js data processing pipeline
│   └── client-app/       # React client application
├── package.json          # Root workspace configuration
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- AWS credentials (for data pipeline)

### Installation

```bash
# Install dependencies for all packages
npm install

# Build shared types
npm run build -w packages/shared
```

### Development

```bash
# Start data pipeline in development mode
npm run dev:pipeline

# Start client application in development mode
npm run dev:client

# Run tests across all packages
npm test

# Type check all packages
npm run type-check
```

## Features

- **Hybrid Search**: Combines semantic similarity and keyword matching
- **Rich Filtering**: Filter by level, services, topics, industry, session type
- **Offline Capable**: Works without internet after initial database load
- **Mobile Responsive**: Optimized for all device sizes
- **Real-time Updates**: Daily automated content updates
- **Performance Optimized**: Client-side processing for instant results

## Technology Stack

### Data Pipeline
- Node.js + TypeScript
- yt-dlp for YouTube integration
- AWS Transcribe for speech-to-text
- AWS Bedrock for embeddings and metadata extraction
- SQLite for data storage
- Puppeteer for web scraping

### Client Application
- React + TypeScript
- Vite for build tooling
- SQLite WASM for client-side database
- Tailwind CSS for styling
- Fast-check for property-based testing

## License

MIT License - see LICENSE file for details