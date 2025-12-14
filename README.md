# AWS re:Invent 2025 Video Search Platform

A client-side video search and discovery platform that enables users to search through AWS re:Invent 2025 conference videos using semantic search, keyword matching, and metadata filtering.

## 🚀 Features

- **Hybrid Search**: Combines semantic similarity and keyword matching for accurate results
- **Rich Filtering**: Filter by technical level, AWS services, topics, industry, session type, duration, and date
- **Offline Capable**: Works without internet after initial database load
- **Browse Mode**: Discover content by categories, topics, and AWS services
- **Mobile Responsive**: Optimized for all device sizes with responsive design
- **Real-time Updates**: Automated content updates with database versioning
- **Performance Optimized**: Client-side processing for instant search results

## Architecture

The system consists of three main components:

1. **Data Pipeline** (`packages/data-pipeline`) - Server-side processing that:
   - Discovers and processes AWS re:Invent 2025 videos using yt-dlp
   - Extracts metadata and transcripts from video content
   - Generates vector embeddings using AWS Bedrock (Nova 2)
   - Enriches content with AI-powered metadata extraction
   - Builds and optimizes SQLite database with FTS5 search
   - Handles database versioning and CDN deployment

2. **Client Application** (`packages/client-app`) - Browser-based React app that:
   - Downloads and caches SQLite database from CDN
   - Provides instant search without server requests
   - Supports hybrid semantic and keyword search
   - Includes comprehensive filtering and browsing interfaces
   - Works offline after initial database load

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

#### Data Pipeline Development

```bash
# Navigate to data pipeline
cd packages/data-pipeline

# Create sample database for development
npm run create-sample-db

# Start development mode
npm run dev

# Run tests
npm test

# Type check
npm run type-check
```

#### Client Application Development

```bash
# Navigate to client app
cd packages/client-app

# Start development server
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build for production
npm run build
```

#### Running All Tests

Do not run all tests as the output length will be super long.

## Features

- **Hybrid Search**: Combines semantic similarity and keyword matching
- **Rich Filtering**: Filter by level, services, topics, industry, session type
- **Offline Capable**: Works without internet after initial database load
- **Mobile Responsive**: Optimized for all device sizes
- **Real-time Updates**: Daily automated content updates
- **Performance Optimized**: Client-side processing for instant results

## Technology Stack

### Data Pipeline
- **Node.js + TypeScript** - Runtime and type safety
- **yt-dlp** - YouTube video discovery and metadata extraction
- **AWS Bedrock (Nova 2)** - Vector embeddings and AI-powered metadata enrichment
- **Better SQLite3** - High-performance database operations
- **Fast-check** - Property-based testing for data integrity

### Client Application
- **React + TypeScript** - UI framework with type safety
- **Vite** - Fast build tooling and development server
- **SQL.js** - SQLite WASM for client-side database operations
- **Tailwind CSS** - Utility-first styling framework
- **Vitest + Testing Library** - Comprehensive testing suite
- **Fast-check** - Property-based testing for search algorithms

### Database & Search
- **SQLite with FTS5** - Full-text search capabilities
- **Vector embeddings** - Semantic similarity search
- **Hybrid search** - Combines keyword and semantic matching
- **Client-side caching** - IndexedDB and localStorage fallbacks

## 🧪 Testing

The project includes comprehensive testing with property-based tests:

- **Property-based testing** using Fast-check for robust validation
- **Unit tests** for individual components and services
- **Integration tests** for search and database operations
- **UI tests** for React components

Key test properties validated:
- Hybrid search combines semantic and keyword results
- Search results contain all required information
- Filter application preserves constraints
- Offline functionality after database load
- Category filtering and counting accuracy
- Topic browsing order by relevance and recency

### Running Tests

```bash
# Run all tests in a specific package
npm test -w packages/client-app
npm test -w packages/data-pipeline

# Run tests in watch mode
npm run test:watch -w packages/client-app

# Run specific test files
npm test SearchEngine.test.ts -w packages/client-app
```

**Note**: Property-based tests have been optimized with reduced iteration counts for faster CI/CD execution while maintaining test coverage.

## 📁 Database Setup

For development, you can create a sample database:

```bash
cd packages/data-pipeline
npm run create-sample-db
```

This creates a sample database at `packages/client-app/public/database/reinvent-videos.db` with test data.

## 🚀 Deployment

### Data Pipeline Deployment
1. Set up AWS credentials for Bedrock access
2. Configure yt-dlp for video discovery
3. Run the pipeline to generate the database
4. Deploy database to CDN (S3 + CloudFront)

### Client Application Deployment
1. Build the client application: `npm run build`
2. Deploy static files to hosting service (Vercel, Netlify, etc.)
3. Ensure database URL points to CDN location

## 📊 Project Status

Current implementation status based on the specification:

### ✅ Completed Features
- [x] Project structure and TypeScript configuration
- [x] Video discovery service using yt-dlp
- [x] Metadata extraction and enrichment
- [x] Vector embedding generation with AWS Bedrock
- [x] SQLite database with FTS5 search
- [x] Database update and deployment services
- [x] React client application foundation
- [x] Database loader with caching and progress tracking
- [x] Hybrid search engine (semantic + keyword)
- [x] Advanced filtering system
- [x] Search interface with auto-complete
- [x] Browse interface for content discovery
- [x] Comprehensive property-based testing

### 🚧 In Progress
- [ ] YouTube URL generation property tests (Property 3)
- [ ] Segment grouping and ordering property tests (Property 9)
- [ ] Error handling and resilience improvements
- [ ] Performance optimizations and database compression
- [ ] Deployment and CDN configuration

### 📋 Remaining Tasks
Based on the current implementation plan:
- [ ] Complete Property 3: YouTube URL generation with timestamps
- [ ] Complete Property 9: Segment grouping and ordering
- [ ] Implement comprehensive error handling (Property 12)
- [ ] Add performance optimizations
- [ ] Set up deployment pipeline and CDN configuration
- [ ] Final testing and validation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## License

MIT License - see LICENSE file for details