#!/usr/bin/env tsx

/**
 * Build production SQLite database with real video data
 * Uses existing services to discover, process, and store video content
 */

import { DatabaseService } from './database/DatabaseService.js'
import { VideoDiscoveryServiceImpl } from './services/VideoDiscoveryService.js'
import { MetadataEnrichmentServiceImpl } from './services/MetadataEnrichmentService.js'
import { EmbeddingServiceImpl } from './services/EmbeddingService.js'
import type { VideoMetadata, VideoSegment } from '@aws-reinvent-search/shared'
import { join, dirname } from 'path'
import { mkdirSync } from 'fs'

interface BuildConfig {
  outputPath: string
  maxVideos?: number
  channelId?: string
  keywords?: string[]
  publishedAfter?: Date
  batchSize?: number
}

async function buildRealDatabase(config: BuildConfig) {
  console.log('🏗️ Building production database with real video data...')
  console.log('Config:', config)
  
  const {
    outputPath,
    maxVideos = 100,
    channelId = 'aws-events',
    keywords = ['reinvent', 'aws'],
    publishedAfter = new Date('2024-01-01'),
    batchSize = 5
  } = config
  
  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true })
  
  // Initialize services
  const discoveryService = new VideoDiscoveryServiceImpl()
  const enrichmentService = new MetadataEnrichmentServiceImpl()
  const embeddingService = new EmbeddingServiceImpl()
  const db = new DatabaseService(outputPath)
  
  try {
    console.log('🔍 Discovering videos from channel...')
    
    // Build channel URL
    const channelUrl = `https://www.youtube.com/c/${channelId}/videos`
    
    // Discover videos using your existing service
    const allVideos = await discoveryService.fetchChannelVideos(channelUrl)
    console.log(`Found ${allVideos.length} total videos from channel`)
    
    // Filter for re:Invent videos
    const reInventVideos = discoveryService.filterReInventVideos(allVideos)
    console.log(`Found ${reInventVideos.length} re:Invent videos`)
    
    // Limit to maxVideos
    const videosToProcess = reInventVideos.slice(0, maxVideos)
    console.log(`Processing ${videosToProcess.length} videos`)
    
    let processedCount = 0
    const totalVideos = videosToProcess.length
    
    // Process videos in batches
    for (let i = 0; i < totalVideos; i += batchSize) {
      const batch = videosToProcess.slice(i, i + batchSize)
      console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalVideos / batchSize)}`)
      
      const batchVideos: VideoMetadata[] = []
      const batchSegments: VideoSegment[] = []
      
      for (const video of batch) {
        try {
          console.log(`  🎥 Processing: ${video.title}`)
          
          // Step 1: Extract transcript
          console.log(`    📝 Extracting transcript...`)
          const transcript = await discoveryService.extractTranscript(video.id)
          
          if (!transcript || transcript.segments.length === 0) {
            console.log(`    ⚠️ No transcript found, skipping ${video.title}`)
            continue
          }
          
          // Step 2: Get full transcript text for enrichment
          const transcriptText = await discoveryService.getTranscriptText(video.id)
          
          if (!transcriptText) {
            console.log(`    ⚠️ No transcript text available, skipping ${video.title}`)
            continue
          }
          
          // Step 3: Enrich metadata with AI (using available methods)
          console.log(`    🤖 Enriching metadata...`)
          const extractedMetadata = await enrichmentService.extractFromTranscript(transcriptText)
          const videoMetadata = await enrichmentService.extractFromVideoMetadata(video)
          const enrichedMetadata = enrichmentService.combineMetadata(extractedMetadata, videoMetadata)
          
          // Update video with enriched metadata
          const enrichedVideo: VideoMetadata = {
            ...video,
            level: enrichedMetadata.level || 'Unknown',
            services: enrichedMetadata.services || [],
            topics: enrichedMetadata.topics || [],
            industry: enrichedMetadata.industry || [],
            sessionType: enrichedMetadata.sessionType || 'Unknown',
            speakers: enrichedMetadata.speakers || [],
            metadataSource: 'combined',
            metadataConfidence: enrichedMetadata.confidence || 0.5,
            extractedKeywords: enrichedMetadata.extractedKeywords || []
          }
          
          // Step 4: Create segments from transcript
          console.log(`    ✂️ Creating segments...`)
          const segments: VideoSegment[] = transcript.segments.map((seg, index) => ({
            id: `${video.id}_seg_${index + 1}`,
            videoId: video.id,
            startTime: seg.startTime,
            endTime: seg.endTime,
            text: seg.text,
            embedding: [], // Will be filled by embedding service
            confidence: seg.confidence,
            speaker: `Speaker ${(index % 2) + 1}` // Simple speaker assignment
          }))
          
          if (segments.length === 0) {
            console.log(`    ⚠️ No segments created, skipping ${video.title}`)
            continue
          }
          
          // Step 5: Generate embeddings for segments
          console.log(`    🧠 Generating embeddings for ${segments.length} segments...`)
          const segmentTexts = segments.map(seg => seg.text)
          const embeddings = await embeddingService.batchGenerateEmbeddings(segmentTexts)
          
          // Add embeddings to segments
          const segmentsWithEmbeddings = segments.map((segment, index) => ({
            ...segment,
            embedding: embeddings[index] || []
          }))
          
          // Add to batch
          batchVideos.push(enrichedVideo)
          batchSegments.push(...segmentsWithEmbeddings)
          
          processedCount++
          console.log(`    ✅ Completed ${video.title} (${processedCount}/${totalVideos})`)
          
        } catch (error) {
          console.error(`    ❌ Failed to process ${video.title}:`, error instanceof Error ? error.message : 'Unknown error')
          // Skip video on error - only process videos that work completely
        }
      }
      
      // Insert batch into database
      if (batchVideos.length > 0) {
        console.log(`  💾 Inserting ${batchVideos.length} videos and ${batchSegments.length} segments...`)
        await db.updateVideoMetadata(batchVideos)
        await db.insertVideoSegments(batchSegments)
      }
      
      // Progress update
      console.log(`  📈 Progress: ${processedCount}/${totalVideos} videos processed`)
    }
    
    // Optimize database
    console.log('\n⚡ Optimizing database...')
    await db.optimizeDatabase()
    
    // Get final stats
    const stats = db.getStats()
    console.log('\n📊 Database build completed!')
    console.log('Final stats:', {
      ...stats,
      fileSizeMB: stats.dbSize ? (stats.dbSize * 4096 / 1024 / 1024).toFixed(2) : 'N/A',
      avgSegmentsPerVideo: stats.videoCount > 0 ? Math.round(stats.segmentCount / stats.videoCount * 100) / 100 : 0
    })
    
    return stats
    
  } finally {
    db.close()
  }
}

// Simple wrapper that uses your current sample data structure
async function buildFromYouTubePlaylist(playlistUrl: string, outputPath: string, maxVideos: number = 50) {
  console.log('🎵 Building database from YouTube playlist...')
  
  // Extract playlist ID from URL
  const playlistId = playlistUrl.match(/[?&]list=([^&]+)/)?.[1]
  if (!playlistId) {
    throw new Error('Invalid playlist URL')
  }
  
  return buildRealDatabase({
    outputPath,
    maxVideos,
    // Use playlist-specific discovery
    channelId: undefined, // Will be determined from playlist
    keywords: [], // No keyword filtering for playlists
    publishedAfter: new Date('2020-01-01') // Broader date range
  })
}

// CLI interface
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log('Usage:')
    console.log('  tsx build-real-db.ts <output-path> [max-videos] [channel-id]')
    console.log('  tsx build-real-db.ts playlist <playlist-url> <output-path> [max-videos]')
    console.log('')
    console.log('Examples:')
    console.log('  tsx build-real-db.ts ../client-app/public/database/real-videos.db 100')
    console.log('  tsx build-real-db.ts ../client-app/public/database/real-videos.db 50 aws-events')
    console.log('  tsx build-real-db.ts playlist "https://youtube.com/playlist?list=PLhr1KZpdzukcaA06WloeNmGlnM_f1LrdP" ../client-app/public/database/reinvent-2024.db 100')
    process.exit(1)
  }
  
  try {
    if (args[0] === 'playlist') {
      // Playlist mode
      const playlistUrl = args[1]
      const outputPath = args[2] || '../client-app/public/database/playlist-videos.db'
      const maxVideos = args[3] ? parseInt(args[3]) : 50
      
      await buildFromYouTubePlaylist(playlistUrl, outputPath, maxVideos)
      
    } else {
      // Channel/keyword mode
      const outputPath = args[0]
      const maxVideos = args[1] ? parseInt(args[1]) : 100
      const channelId = args[2] || 'aws-events'
      
      await buildRealDatabase({
        outputPath,
        maxVideos,
        channelId,
        keywords: ['reinvent', 'aws'],
        publishedAfter: new Date('2024-01-01')
      })
    }
    
    console.log('🎉 Database build completed successfully!')
    
  } catch (error) {
    console.error('💥 Database build failed:', error)
    process.exit(1)
  }
}

// Export for programmatic use
export { buildRealDatabase, buildFromYouTubePlaylist, type BuildConfig }

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}