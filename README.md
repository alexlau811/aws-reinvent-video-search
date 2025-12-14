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

# Create production database
npm run create-production-db

# Create production database with backup and compression
npm run create-production-db:full

# Verify database integrity
npm run verify-production-db [database-path]

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
- **AWS Bedrock (Nova 2 Multimodal Embeddings)** - Vector embeddings and AI-powered metadata enrichment
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

### Development Database

For development, you can create a sample database with test data:

```bash
cd packages/data-pipeline
npm run create-sample-db
```

This creates a sample database at `packages/client-app/public/database/reinvent-videos.db` with test data.

### Production Database

For production deployment, you have several options for creating databases with real video data:

#### Option 1: Build from Real YouTube Data (Recommended)

```bash
cd packages/data-pipeline

# Build from AWS Events channel
tsx src/build-real-db.ts ../client-app/public/database/real-videos.db 100 aws-events

# Build from specific YouTube playlist
tsx src/build-real-db.ts playlist "https://youtube.com/playlist?list=PLhr1KZpdzukcaA06WloeNmGlnM_f1LrdP" ../client-app/public/database/reinvent-2024.db 100

# Build with custom configuration
tsx src/build-real-db.ts ../client-app/public/database/custom-videos.db 50 aws-events
```

#### Option 1a: Build ALL Videos from Channel/Playlist (New!)

```bash
cd packages/data-pipeline

# Process ALL videos from a YouTube channel (no filtering)
npm run build-all-videos "https://www.youtube.com/@channelname"

# Process first 100 videos only
npm run build-all-videos "https://www.youtube.com/@channelname" ./videos.db --max-videos 100

# Skip transcripts for faster processing (metadata only)
npm run build-all-videos "https://www.youtube.com/@channelname" ./videos.db --skip-transcripts

# Process entire playlist with custom batch size
npm run build-all-videos "https://www.youtube.com/playlist?list=PLxxxxxx" ./playlist.db --batch-size 10

# Full example with all options
npm run build-all-videos "https://www.youtube.com/@AWSEventsChannel" ../client-app/public/database/aws-all-videos.db --max-videos 500 --batch-size 3
```

#### Option 2: Production Database Scripts

```bash
cd packages/data-pipeline

# Create production database with real video data
npm run create-production-db

# Create production database with backup and compression
npm run create-production-db:full

# Verify production database integrity
npm run verify-production-db [path-to-database]
```

#### Option 3: Simple Production Database

```bash
cd packages/data-pipeline

# Create optimized version from sample data
npm run create-production-db:simple
```

**Production Database Features:**
- **Real Data Processing**: Integrates with yt-dlp for actual video discovery and transcript extraction
  - **Real Transcript Extraction**: Extracts actual YouTube subtitles and auto-generated captions
  - **Subtitle Detection**: Automatically checks subtitle availability before processing
  - **Multi-format Support**: Handles both manual and auto-generated subtitle formats
  - **Robust Error Handling**: Gracefully handles videos without available transcripts
- **AWS Bedrock Nova 2 Integration**: Uses latest Nova 2 Multimodal Embeddings model with optimized API schema
  - 1024-dimensional embeddings for enhanced semantic search quality
  - Proper API payload structure with nova-multimodal-embed-v1 schema
  - Configured for GENERIC_INDEX embedding purpose for optimal vector database performance
  - Enhanced text truncation and token management
- **Comprehensive Channel Processing**: New `build-all-videos` script processes ALL videos from channels/playlists without filtering
- **Flexible Processing Options**: Skip transcripts for faster processing or include full transcript analysis
- **Batch Processing**: Processes videos in configurable batches for memory efficiency (default: 5 videos per batch)
- **Error Recovery**: Continues processing even if individual videos fail
- **Progress Tracking**: Real-time progress reporting during database creation
- **Automatic Backup**: Creates backups before overwriting existing databases
- **Compression**: Optimizes database size for CDN distribution
- **Integrity Verification**: Validates database structure and content
- **Performance Optimization**: Includes indexing and query optimization

## 🚀 Deployment

### Prerequisites

1. **AWS Credentials**: Configure AWS credentials for Bedrock Nova 2 Multimodal Embeddings access
   ```bash
   aws configure
   # or set environment variables:
   # AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
   ```

2. **yt-dlp Installation**: Ensure yt-dlp is installed and accessible
   ```bash
   pip install yt-dlp
   # or
   brew install yt-dlp
   ```

### Data Pipeline Deployment

1. **Generate Production Database**:
   ```bash
   cd packages/data-pipeline
   
   # Set AWS region for Bedrock Nova 2 Multimodal Embeddings
   export AWS_REGION=us-east-1
   
   # Option A: Build from real YouTube data (recommended)
   tsx src/build-real-db.ts ../client-app/public/database/reinvent-videos.db 100
   
   # Option B: Use production database scripts
   npm run create-production-db:full
   ```

2. **Deploy Database to CDN**:
   ```bash
   # Deploy to S3 + CloudFront
   npm run deploy-production-db
   ```

3. **Verify Deployment**:
   ```bash
   # Verify database integrity
   npm run verify-production-db
   ```

### Client Application Deployment

1. **Build the Application**:
   ```bash
   cd packages/client-app
   npm run build
   ```

2. **Deploy Static Files**:
   - **Vercel**: `vercel --prod`
   - **Netlify**: `netlify deploy --prod --dir=dist`
   - **AWS S3**: Upload `dist/` contents to S3 bucket

3. **Configure Database URL**:
   - Update database URL in client configuration to point to CDN location
   - Ensure CORS is configured for cross-origin database access

### Environment Variables

**Data Pipeline**:
- `AWS_REGION`: AWS region for Bedrock Nova 2 Multimodal Embeddings (default: us-east-1)
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `MAX_VIDEOS`: Maximum number of videos to process (optional)

**Client Application**:
- `VITE_DATABASE_URL`: URL to the production database (CDN endpoint)

## 📊 Project Status

Current implementation status based on the specification:

### ✅ Completed Features
- [x] Project structure and TypeScript configuration
- [x] Video discovery service using yt-dlp
- [x] Metadata extraction and enrichment
- [x] Vector embedding generation with AWS Bedrock Nova 2 Multimodal Embeddings
- [x] SQLite database with FTS5 search
- [x] Database update and deployment services
- [x] Production database management with backup and compression
- [x] Real video data processing pipeline (build-real-db.ts)
- [x] Batch processing with error recovery and progress tracking
- [x] Database integrity verification and optimization
- [x] React client application foundation
- [x] Database loader with caching and progress tracking
- [x] Hybrid search engine (semantic + keyword)
- [x] Advanced filtering system
- [x] Search interface with auto-complete
- [x] Browse interface for content discovery
- [x] Comprehensive property-based testing
- [x] Improved test reliability and performance

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