# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Transcript Processing Enhancement**: Major upgrade to video transcript processing pipeline
  - **Segment Consolidation**: VTT segments are now consolidated into meaningful 1000+ character chunks for better embedding efficiency
  - **AI-Powered Metadata Extraction**: Integration with Amazon Nova 2 Lite for intelligent content analysis
    - Automatic extraction of speaker names from transcript content
    - AWS service identification and categorization
    - Topic classification and industry vertical detection
    - Session type recognition (Workshop, Keynote, Breakout, etc.)
  - **Title-Based Level Extraction**: Derives technical difficulty from video titles using AWS re:Invent session codes
    - 1xx series → Introductory level
    - 2xx series → Intermediate level  
    - 3xx series → Advanced level
    - 4xx series → Expert level
  - **Sentence Boundary Splitting**: Intelligently splits long segments at sentence boundaries to stay within embedding model limits
  - **Enhanced Property-Based Testing**: Comprehensive validation of segment processing, level mapping, and metadata enrichment
  - **Improved Subtitle Processing**: Enhanced language detection and VTT parsing with better error handling

### Changed
- **BREAKING**: Upgraded to AWS Bedrock Nova 2 Multimodal Embeddings model (`amazon.nova-2-multimodal-embeddings-v1:0`)
  - Updated API payload structure to use nova-multimodal-embed-v1 schema
  - Configured proper taskType and singleEmbeddingParams for optimal performance
  - Set embeddingPurpose to GENERIC_INDEX for vector database indexing
  - Added query-optimized embeddings with TEXT_RETRIEVAL purpose for better search performance
  - Fixed response format parsing to handle Nova 2's embeddings array structure
  - Improved embedding quality and multimodal capabilities
  - Updated all embedding dimensions from 384 to 1024 for consistency
  - Enhanced retry logic with exponential backoff for better reliability
  - Better error handling and rate limiting
  - Added text truncation mode configuration for better token management

- **BREAKING**: Replaced mock transcript implementation with real yt-dlp subtitle extraction
  - VideoDiscoveryService now attempts to extract actual YouTube subtitles
  - Removed hardcoded mock transcripts in favor of real video data
  - Added comprehensive subtitle availability checking
  - Improved error handling for subtitle extraction failures
  - Enhanced production readiness for real video content processing
  - **NEW**: Improved subtitle language detection by removing restrictive language filtering
  - **NEW**: Added segment consolidation to parseVTTContent method for better embedding efficiency

- New `build-all-reinvent.ts` script for processing ALL re:Invent 2025 videos without limits
  - Supports batch processing with configurable batch sizes
  - Comprehensive error handling and progress tracking
  - Both transcript extraction and metadata-only processing modes
  - Compatible with Nova 2 Multimodal Embeddings

- Real transcript extraction capabilities using yt-dlp with filesystem operations
  - Automatic detection of subtitle availability before extraction
  - Support for both manual and auto-generated subtitles
  - Filesystem-based VTT file processing with temporary file management
  - Proper cleanup of temporary subtitle files after processing
  - Enhanced VTT parsing with improved logging and error handling
  - Proper error handling when subtitles are unavailable
  - Enhanced video info checking for subtitle metadata

### Fixed
- Fixed unused `retryDelay` variable in EmbeddingService by properly implementing retry logic
- Updated all test files to use 1024-dimensional embeddings for Nova 2 compatibility
- Updated database validation to expect 1024-dimensional embeddings
- Updated sample database generation to create Nova 2 compatible embeddings
- Improved null safety in getTranscriptText method with additional segment checks
- **BREAKING**: Enhanced error handling in video processing scripts
  - Fixed type safety in build-all-videos.ts with proper const assertions for metadata objects
  - Improved error handling across all video processing scripts (build-all-videos, build-all-reinvent, build-real-db)
  - Videos that fail processing are now skipped instead of adding incomplete data to maintain database quality
  - Videos without transcripts are skipped when transcript processing is enabled for consistent behavior
  - Enhanced error messages with proper instanceof Error checks

### Removed
- Removed `deploy-production-db.ts` script (functionality consolidated into other deployment scripts)
- Cleaned up redundant deployment utilities in favor of streamlined production database creation
  - Improved error handling across all video processing scripts (build-all-videos, build-all-reinvent, build-real-db)
  - Videos that fail processing are now skipped instead of adding incomplete data to maintain database quality
  - Videos without transcripts are skipped when transcript processing is enabled for consistent behavior
  - Enhanced error messages with proper instanceof Error checks

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