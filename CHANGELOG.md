# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **BREAKING**: Upgraded to AWS Bedrock Nova 2 Multimodal Embeddings model (`amazon.nova-2-multimodal-embeddings-v1:0`)
  - Improved embedding quality and multimodal capabilities
  - Updated all embedding dimensions from 384 to 1024 for consistency
  - Enhanced retry logic with exponential backoff for better reliability
  - Better error handling and rate limiting

### Added
- New `build-all-reinvent.ts` script for processing ALL re:Invent 2025 videos without limits
  - Supports batch processing with configurable batch sizes
  - Comprehensive error handling and progress tracking
  - Both transcript extraction and metadata-only processing modes
  - Compatible with Nova 2 Multimodal Embeddings

### Fixed
- Fixed unused `retryDelay` variable in EmbeddingService by properly implementing retry logic
- Updated all test files to use 1024-dimensional embeddings for Nova 2 compatibility
- Updated database validation to expect 1024-dimensional embeddings
- Updated sample database generation to create Nova 2 compatible embeddings

## [1.0.0] - 2024-12-14

### Added
- Initial release of AWS re:Invent 2025 Video Search Platform
- Client-side React application with hybrid search capabilities
- Data processing pipeline with real YouTube video integration
- SQLite database with FTS5 full-text search
- Vector embeddings using AWS Bedrock
- Comprehensive filtering and browsing interfaces
- Property-based testing with Fast-check
- Production deployment scripts and CDN integration
- Offline-capable client application
- Real-time database updates and versioning

### Features
- **Hybrid Search**: Combines semantic similarity and keyword matching
- **Rich Filtering**: Filter by technical level, AWS services, topics, industry, session type
- **Offline Capable**: Works without internet after initial database load
- **Mobile Responsive**: Optimized for all device sizes
- **Real-time Updates**: Automated content updates with database versioning
- **Performance Optimized**: Client-side processing for instant search results

### Technical Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + TypeScript + Better SQLite3
- **AI/ML**: AWS Bedrock Nova 2 for embeddings and metadata enrichment
- **Video Processing**: yt-dlp for YouTube integration
- **Testing**: Vitest + Testing Library + Fast-check property-based testing
- **Deployment**: CDN-ready with S3 + CloudFront integration