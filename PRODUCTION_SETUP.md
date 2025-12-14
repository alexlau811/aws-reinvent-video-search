# Production Database Setup Guide

This guide walks you through creating and deploying a production-ready database for your AWS re:Invent video search platform.

## Overview

Your platform uses SQLite for client-side search, which is perfect for this use case since:
- ✅ Works offline after initial download
- ✅ Fast client-side queries
- ✅ No server infrastructure needed
- ✅ Easy to deploy via CDN

## Production Database Options

### Option 1: Enhanced SQLite (Recommended)

This is your current architecture optimized for production:

```bash
# Create production database with real data
cd packages/data-pipeline
npm run create-production-db

# Create optimized version with compression
npm run create-production-db:full

# Verify database integrity
npm run verify-production-db
```

### Option 2: Alternative Database Solutions

If you need to scale beyond SQLite, consider:

#### PostgreSQL with API
```typescript
// Example API endpoint structure
GET /api/search?q=lambda&filters=level:intermediate
GET /api/videos/:id
GET /api/browse/topics
```

#### DynamoDB with API Gateway
```typescript
// DynamoDB table structure
{
  PK: "VIDEO#video1",
  SK: "METADATA",
  title: "AWS Lambda Best Practices",
  // ... other fields
}
{
  PK: "VIDEO#video1", 
  SK: "SEGMENT#001",
  text: "Welcome to this session...",
  embedding: [0.1, 0.2, ...], // Store as binary
}
```

## Production SQLite Setup (Recommended)

### 1. Install Dependencies

```bash
cd packages/data-pipeline
npm install @aws-sdk/client-s3 @aws-sdk/client-cloudfront
```

### 2. Configure AWS Credentials

```bash
# Set up AWS credentials
aws configure

# Or use environment variables
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=us-east-1
```

### 3. Create Production Database

#### Option A: Build from Real YouTube Data (Recommended)

```bash
# Build from AWS Events channel with real video data
tsx src/build-real-db.ts ../client-app/public/database/reinvent-videos.db 100 aws-events

# Build from specific YouTube playlist
tsx src/build-real-db.ts playlist \
  "https://youtube.com/playlist?list=PLhr1KZpdzukcaA06WloeNmGlnM_f1LrdP" \
  ../client-app/public/database/reinvent-2024.db \
  100

# Build with custom batch size for memory management
tsx src/build-real-db.ts ../client-app/public/database/custom-videos.db 50 aws-events
```

#### Option A2: Build ALL Videos from Channel/Playlist (New!)

```bash
# Process ALL videos from a YouTube channel (no content filtering)
npm run build-all-videos "https://www.youtube.com/@AWSEventsChannel"

# Process first 500 videos with transcript extraction
npm run build-all-videos \
  "https://www.youtube.com/@AWSEventsChannel" \
  ../client-app/public/database/aws-all-videos.db \
  --max-videos 500

# Fast processing without transcripts (metadata only)
npm run build-all-videos \
  "https://www.youtube.com/@AWSEventsChannel" \
  ../client-app/public/database/aws-metadata-only.db \
  --skip-transcripts \
  --max-videos 1000

# Process entire playlist with custom batch size
npm run build-all-videos \
  "https://www.youtube.com/playlist?list=PLhr1KZpdzukcaA06WloeNmGlnM_f1LrdP" \
  ../client-app/public/database/reinvent-complete.db \
  --batch-size 3
```

#### Option B: Production Database Scripts

```bash
# Basic production database
npm run create-production-db

# Full production with all optimizations
npm run create-production-db:full -- \
  --output ../client-app/public/database/reinvent-videos-prod.db \
  --max-videos 1000 \
  --backup

# Custom configuration
tsx src/create-production-db.ts \
  /path/to/output.db \
  500 \
  --backup \
  --compression
```

**Real Data Processing Features:**
- **Transcript Extraction**: Uses yt-dlp to extract actual video transcripts
- **AI Metadata Enrichment**: Leverages AWS Bedrock Nova 2 Multimodal Embeddings for intelligent content analysis
- **Comprehensive Channel Processing**: New `build-all-videos` script processes ALL videos without content filtering
- **Flexible Processing Modes**: Choose between full transcript analysis or metadata-only for faster processing
- **Batch Processing**: Processes videos in configurable batches (default: 5 videos per batch)
- **Error Recovery**: Continues processing even if individual videos fail
- **Progress Tracking**: Real-time progress reporting during database creation
- **Memory Efficient**: Processes and inserts data in batches to manage memory usage

### 4. Deploy to CDN

```bash
# Deploy to S3 + CloudFront
tsx src/deploy-production-db.ts \
  your-bucket-name \
  ../client-app/public/database/reinvent-videos-prod.db \
  your-cloudfront-distribution-id

# Environment variables for deployment
export AWS_REGION=us-east-1
export DB_KEY_PREFIX=database/
tsx src/deploy-production-db.ts your-bucket-name /path/to/db.db
```

### 5. Update Client Configuration

Update your client app to use the production database:

```typescript
// packages/client-app/src/config/database.ts
export const DATABASE_CONFIG = {
  // Production CDN URL
  url: 'https://your-cdn-domain.com/database/reinvent-videos-latest.db',
  
  // Fallback URLs
  fallbackUrls: [
    'https://your-bucket.s3.amazonaws.com/database/reinvent-videos-latest.db'
  ],
  
  // Version checking
  manifestUrl: 'https://your-cdn-domain.com/database/manifest.json',
  
  // Cache settings
  cacheKey: 'reinvent-videos-db',
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}
```

## Database Optimization Features

### Performance Optimizations
- **WAL Mode**: Better concurrent access
- **Memory Mapping**: 512MB for faster queries  
- **Large Cache**: 20MB cache size
- **Optimized Page Size**: 4KB pages
- **Query Planner**: Automatic optimization

### Compression & Size
- **VACUUM**: Reclaims unused space
- **FTS5 Optimization**: Rebuilt indexes
- **Incremental Vacuum**: Ongoing maintenance
- **Binary Embeddings**: Efficient storage

### Reliability Features
- **Data Validation**: Input validation before insert
- **Integrity Checks**: Database verification
- **Backup Creation**: Automatic backups
- **Metrics Tracking**: Performance monitoring
- **Version Management**: Database versioning

## Monitoring & Maintenance

### Database Metrics

The production database generates metrics:

```json
{
  "totalSize": 52428800,
  "videoCount": 1000,
  "segmentCount": 15000,
  "avgSegmentsPerVideo": 15.0,
  "lastOptimized": "2024-12-14T10:30:00Z",
  "version": "1.0.0"
}
```

### Health Checks

```bash
# Verify database integrity
npm run verify-production-db /path/to/database.db

# Check performance metrics
tsx -e "
import { ProductionDatabaseService } from './src/database/ProductionDatabaseService.js';
const db = new ProductionDatabaseService('path/to/db.db');
const metrics = await db.verifyDatabase();
console.log(metrics);
db.close();
"
```

### Automated Updates

Set up automated database updates:

```bash
#!/bin/bash
# update-database.sh

# Create new production database
npm run create-production-db:full

# Deploy to CDN
tsx src/deploy-production-db.ts \
  $BUCKET_NAME \
  ../client-app/public/database/reinvent-videos-prod.db \
  $CLOUDFRONT_DISTRIBUTION_ID

# Verify deployment
curl -I https://your-cdn-domain.com/database/manifest.json
```

## Alternative: Server-Side API

If you decide to move away from client-side SQLite:

### 1. API Architecture

```typescript
// API Routes
app.get('/api/search', searchHandler)
app.get('/api/videos/:id', videoHandler)
app.get('/api/browse/:category', browseHandler)

// Search endpoint
async function searchHandler(req: Request, res: Response) {
  const { q, filters, limit = 20, offset = 0 } = req.query
  
  // Combine semantic and keyword search
  const results = await searchService.hybridSearch(q, filters, limit, offset)
  
  res.json({
    results,
    total: results.length,
    hasMore: results.length === limit
  })
}
```

### 2. Database Options

#### PostgreSQL with pgvector
```sql
-- Vector similarity search
CREATE EXTENSION vector;

CREATE TABLE video_segments (
  id TEXT PRIMARY KEY,
  video_id TEXT,
  text TEXT,
  embedding vector(1024),
  start_time REAL,
  end_time REAL
);

-- Vector similarity index
CREATE INDEX ON video_segments USING ivfflat (embedding vector_cosine_ops);

-- Hybrid search query
SELECT v.*, s.text, s.start_time,
       1 - (s.embedding <=> $1::vector) as similarity
FROM videos v
JOIN video_segments s ON v.id = s.video_id
WHERE s.embedding <=> $1::vector < 0.3
  AND (v.title ILIKE $2 OR s.text ILIKE $2)
ORDER BY similarity DESC
LIMIT 20;
```

#### DynamoDB with OpenSearch
```typescript
// DynamoDB for metadata, OpenSearch for search
const searchResults = await opensearch.search({
  index: 'video-segments',
  body: {
    query: {
      bool: {
        should: [
          { match: { text: query } },
          { knn: { embedding: { vector: queryEmbedding, k: 10 } } }
        ]
      }
    }
  }
})
```

## Deployment Checklist

### Pre-Production
- [ ] Data validation passes
- [ ] Database integrity verified
- [ ] Performance benchmarks meet requirements
- [ ] Backup strategy implemented
- [ ] Monitoring configured

### Production Deployment
- [ ] Database uploaded to CDN
- [ ] CloudFront cache configured
- [ ] Client app updated with production URLs
- [ ] Health checks passing
- [ ] Rollback plan ready

### Post-Deployment
- [ ] Monitor database download metrics
- [ ] Verify search performance
- [ ] Check error rates
- [ ] Validate offline functionality
- [ ] Schedule regular updates

## Troubleshooting

### Common Issues

**Large Database Size**
```bash
# Check compression
gzip -9 database.db
# Consider segment reduction or embedding compression

# Optimize embeddings
# Use quantization or dimensionality reduction
```

**Slow Downloads**
```bash
# Enable compression
export DISABLE_COMPRESSION=false

# Use CloudFront
# Configure proper cache headers
# Consider multiple CDN regions
```

**Client Memory Issues**
```typescript
// Stream database loading
const response = await fetch(databaseUrl)
const reader = response.body?.getReader()
// Process in chunks
```

### Performance Tuning

```sql
-- Analyze query performance
EXPLAIN QUERY PLAN SELECT * FROM videos_fts WHERE videos_fts MATCH 'lambda';

-- Check index usage
PRAGMA index_info(idx_videos_published_at);

-- Monitor cache hit ratio
PRAGMA cache_size;
```

## Cost Optimization

### S3 Storage Classes
- **Standard**: For frequently accessed database
- **IA**: For backup versions
- **Glacier**: For long-term archival

### CloudFront Optimization
- **Price Class**: Choose appropriate regions
- **Compression**: Enable gzip compression
- **Cache Behavior**: Long cache for versioned files

### Database Size Management
- **Segment Pruning**: Remove low-confidence segments
- **Embedding Compression**: Use quantization
- **Metadata Optimization**: Remove unused fields

This setup gives you a production-ready database that scales well for your video search platform while maintaining the benefits of client-side processing.