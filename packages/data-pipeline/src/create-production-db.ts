#!/usr/bin/env tsx

/**
 * Script to create a production-ready database with real data
 * This script should be used with actual video data from your pipeline
 */

import { DatabaseService } from './database/DatabaseService.js'
import { VideoDiscoveryService } from './services/VideoDiscoveryService.js'
import { MetadataEnrichmentService } from './services/MetadataEnrichmentService.js'
import { EmbeddingService } from './services/EmbeddingService.js'
import type { VideoMetadata } from '@aws-reinvent-search/shared'
import { join } from 'path'
import { mkdirSync, existsSync, copyFileSync } from 'fs'

interface ProductionConfig {
  outputPath: string
  maxVideos?: number
  enableCompression?: boolean
  enableOptimizations?: boolean
  backupPath?: string
}

async function createProductionDatabase(config: ProductionConfig) {
  console.log('🚀 Creating production database...')
  console.log('Configuration:', config)
  
  const { outputPath, maxVideos, enableCompression = true, enableOptimizations = true, backupPath } = config
  
  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true })
  
  // Create backup if existing database exists
  if (backupPath && existsSync(outputPath)) {
    console.log('📦 Creating backup of existing database...')
    copyFileSync(outputPath, backupPath)
  }
  
  const db = new DatabaseService(outputPath)
  
  try {
    // Initialize services for real data processing
    const discoveryService = new VideoDiscoveryService()
    const enrichmentService = new MetadataEnrichmentService()
    const embeddingService = new EmbeddingService()
    
    console.log('🔍 Discovering videos...')
    const videoIds = await discoveryService.discoverVideos({
      maxResults: maxVideos,
      channelId: 'aws-events', // AWS Events channel
      publishedAfter: new Date('2024-01-01'), // re:Invent 2024+
      keywords: ['reinvent', 'aws']
    })
    
    console.log(`Found ${videoIds.length} videos to process`)
    
    // Process videos in batches
    const batchSize = 10
    let processedCount = 0
    
    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize)
      console.log(`📊 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(videoIds.length / batchSize)}`)
      
      // Extract metadata for batch
      const videoMetadata: VideoMetadata[] = []
      
      for (const videoId of batch) {
        try {
          console.log(`  Processing video: ${videoId}`)
          
          // Extract basic metadata
          const basicMetadata = await discoveryService.extractVideoMetadata(videoId)
          
          // Enrich with AI-powered metadata
          const enrichedMetadata = await enrichmentService.enrichMetadata(basicMetadata)
          
          // Extract transcript and create segments
          const transcript = await discoveryService.extractTranscript(videoId)
          const segments = await enrichmentService.createSegments(transcript, videoId)
          
          // Generate embeddings for segments
          const segmentsWithEmbeddings = await embeddingService.generateEmbeddings(segments)
          
          videoMetadata.push(enrichedMetadata)
          
          // Insert segments
          await db.insertVideoSegments(segmentsWithEmbeddings)
          
          processedCount++
          console.log(`  ✅ Processed ${processedCount}/${videoIds.length} videos`)
          
        } catch (error) {
          console.error(`  ❌ Failed to process video ${videoId}:`, error)
          // Continue with other videos
        }
      }
      
      // Insert video metadata batch
      if (videoMetadata.length > 0) {
        await db.updateVideoMetadata(videoMetadata)
      }
    }
    
    if (enableOptimizations) {
      console.log('⚡ Optimizing database for production...')
      
      // Enable production SQLite settings
      db.db.pragma('journal_mode = WAL')
      db.db.pragma('synchronous = NORMAL')
      db.db.pragma('cache_size = 10000') // Larger cache for production
      db.db.pragma('temp_store = memory')
      db.db.pragma('mmap_size = 268435456') // 256MB memory mapping
      
      // Optimize database
      await db.optimizeDatabase()
      
      // Additional production optimizations
      db.db.exec('PRAGMA optimize')
      db.db.exec('PRAGMA analysis_limit = 1000')
      db.db.exec('ANALYZE')
    }
    
    if (enableCompression) {
      console.log('🗜️ Applying compression optimizations...')
      
      // Vacuum to reclaim space and optimize file structure
      db.db.exec('VACUUM')
      
      // Consider using SQLite's built-in compression
      // Note: This requires SQLite compiled with SQLITE_ENABLE_COMPRESS
      try {
        db.db.exec('PRAGMA compress = 1')
      } catch (error) {
        console.warn('Compression not available in this SQLite build')
      }
    }
    
    // Get final statistics
    const stats = db.getStats()
    console.log('📈 Production database created successfully!')
    console.log('Final statistics:', {
      ...stats,
      fileSizeMB: stats.dbSize ? (stats.dbSize * 4096 / 1024 / 1024).toFixed(2) : 'N/A'
    })
    
    // Verify database integrity
    console.log('🔍 Verifying database integrity...')
    const integrityCheck = db.db.prepare('PRAGMA integrity_check').get()
    if (integrityCheck.integrity_check === 'ok') {
      console.log('✅ Database integrity verified')
    } else {
      console.error('❌ Database integrity check failed:', integrityCheck)
    }
    
    return stats
    
  } finally {
    db.close()
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2)
  const config: ProductionConfig = {
    outputPath: args[0] || join(process.cwd(), '../client-app/public/database/reinvent-videos-prod.db'),
    maxVideos: args[1] ? parseInt(args[1]) : undefined,
    enableCompression: !args.includes('--no-compression'),
    enableOptimizations: !args.includes('--no-optimization'),
    backupPath: args.includes('--backup') ? 
      join(process.cwd(), '../client-app/public/database/reinvent-videos-backup.db') : 
      undefined
  }
  
  try {
    await createProductionDatabase(config)
    console.log('🎉 Production database creation completed!')
  } catch (error) {
    console.error('💥 Failed to create production database:', error)
    process.exit(1)
  }
}

// Export for programmatic use
export { createProductionDatabase, type ProductionConfig }

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}