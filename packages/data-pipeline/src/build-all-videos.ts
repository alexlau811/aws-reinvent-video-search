#!/usr/bin/env tsx

/**
 * Build production database with ALL videos from YouTube channel/playlist
 * No filtering - processes every video found
 */

import { DatabaseService } from './database/DatabaseService.js'
import { VideoDiscoveryServiceImpl } from './services/VideoDiscoveryService.js'
import { MetadataEnrichmentServiceImpl } from './services/MetadataEnrichmentService.js'
import { EmbeddingServiceImpl } from './services/EmbeddingService.js'
import type { VideoMetadata, VideoSegment } from '@aws-reinvent-search/shared'
import { dirname } from 'path'
import { mkdirSync } from 'fs'

async function buildAllVideosDatabase(
  channelUrl: string, 
  outputPath: string, 
  options: {
    maxVideos?: number
    skipTranscripts?: boolean
    batchSize?: number
  } = {}
) {
  const { maxVideos, skipTranscripts = false, batchSize = 5 } = options
  
  console.log('🏗️ Building database with ALL videos from YouTube...')
  console.log(`Source: ${channelUrl}`)
  console.log(`Output: ${outputPath}`)
  console.log(`Max videos: ${maxVideos || 'unlimited'}`)
  console.log(`Skip transcripts: ${skipTranscripts}`)
  
  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true })
  
  // Initialize services
  const discoveryService = new VideoDiscoveryServiceImpl()
  const enrichmentService = new MetadataEnrichmentServiceImpl()
  const embeddingService = new EmbeddingServiceImpl()
  const db = new DatabaseService(outputPath)
  
  try {
    // Step 1: Fetch ALL videos from channel/playlist
    console.log('\n🔍 Step 1: Discovering ALL videos...')
    const allVideos = await discoveryService.fetchChannelVideos(channelUrl)
    console.log(`Found ${allVideos.length} total videos`)
    
    // Step 2: Apply max limit if specified (no filtering by content)
    const videosToProcess = maxVideos ? allVideos.slice(0, maxVideos) : allVideos
    console.log(`Processing ${videosToProcess.length} videos`)
    
    // Step 3: Process videos in batches
    console.log('\n📊 Step 2: Processing videos...')
    let processedCount = 0
    
    for (let i = 0; i < videosToProcess.length; i += batchSize) {
      const batch = videosToProcess.slice(i, i + batchSize)
      console.log(`\n📦 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(videosToProcess.length / batchSize)}`)
      
      const batchVideos: VideoMetadata[] = []
      const batchSegments: VideoSegment[] = []
      
      for (const video of batch) {
        console.log(`\n🎥 ${processedCount + 1}/${videosToProcess.length}: ${video.title}`)
        
        try {
          let enrichedVideo = video
          
          if (!skipTranscripts) {
            // Try to extract transcript
            console.log('  📝 Extracting transcript...')
            const transcript = await discoveryService.extractTranscript(video.id)
            
            if (transcript && transcript.segments.length > 0) {
              console.log(`  ✅ Found transcript with ${transcript.segments.length} segments`)
              
              // Enrich metadata using transcript
              const transcriptText = transcript.segments.map(s => s.text).join(' ')
              const transcriptMetadata = await enrichmentService.extractFromTranscript(transcriptText)
              const videoMetadata = await enrichmentService.extractFromVideoMetadata(video)
              const enrichedMetadata = enrichmentService.combineMetadata(transcriptMetadata, videoMetadata)
              
              // Update video with enriched metadata
              enrichedVideo = {
                ...video,
                level: enrichedMetadata.level,
                services: enrichedMetadata.services,
                topics: enrichedMetadata.topics,
                industry: enrichedMetadata.industry,
                sessionType: enrichedMetadata.sessionType,
                speakers: enrichedMetadata.speakers,
                metadataSource: 'combined',
                metadataConfidence: enrichedMetadata.confidence,
                extractedKeywords: enrichedMetadata.extractedKeywords
              }
              
              // Create segments with embeddings
              console.log('  🧠 Generating embeddings...')
              for (let j = 0; j < transcript.segments.length; j++) {
                const segment = transcript.segments[j]
                
                try {
                  const embedding = await embeddingService.generateEmbeddings(segment.text)
                  
                  const videoSegment: VideoSegment = {
                    id: `${video.id}_seg_${j + 1}`,
                    videoId: video.id,
                    startTime: segment.startTime,
                    endTime: segment.endTime,
                    text: segment.text,
                    embedding,
                    confidence: segment.confidence,
                    speaker: `Speaker ${(j % 2) + 1}`
                  }
                  
                  batchSegments.push(videoSegment)
                } catch (embeddingError) {
                  console.warn(`    ⚠️ Failed embedding for segment ${j + 1}:`, embeddingError instanceof Error ? embeddingError.message : 'Unknown error')
                }
              }
              
              console.log(`  ✅ Created ${transcript.segments.length} segments`)
              
            } else {
              console.log('  ⚠️ No transcript available, using basic metadata')
              
              // Basic metadata enrichment only
              const videoMetadata = await enrichmentService.extractFromVideoMetadata(video)
              const basicEnriched = enrichmentService.combineMetadata(
                { inferredServices: [], inferredTopics: [], inferredLevel: 'Unknown', sessionType: 'Unknown', speakers: [], keyTerms: [], confidence: 0.5 },
                videoMetadata
              )
              
              enrichedVideo = {
                ...video,
                level: basicEnriched.level,
                services: basicEnriched.services,
                topics: basicEnriched.topics,
                industry: basicEnriched.industry,
                sessionType: basicEnriched.sessionType,
                speakers: basicEnriched.speakers,
                metadataSource: 'video-metadata',
                metadataConfidence: basicEnriched.confidence,
                extractedKeywords: basicEnriched.extractedKeywords
              }
            }
          } else {
            console.log('  ⏭️ Skipping transcript (skipTranscripts=true)')
            
            // Just basic metadata enrichment
            const videoMetadata = await enrichmentService.extractFromVideoMetadata(video)
            const basicEnriched = enrichmentService.combineMetadata(
              { inferredServices: [], inferredTopics: [], inferredLevel: 'Unknown', sessionType: 'Unknown', speakers: [], keyTerms: [], confidence: 0.5 },
              videoMetadata
            )
            
            enrichedVideo = {
              ...video,
              level: basicEnriched.level,
              services: basicEnriched.services,
              topics: basicEnriched.topics,
              industry: basicEnriched.industry,
              sessionType: basicEnriched.sessionType,
              speakers: basicEnriched.speakers,
              metadataSource: 'video-metadata',
              metadataConfidence: basicEnriched.confidence,
              extractedKeywords: basicEnriched.extractedKeywords
            }
          }
          
          batchVideos.push(enrichedVideo)
          processedCount++
          
        } catch (error) {
          console.error(`  ❌ Failed to process video:`, error instanceof Error ? error.message : 'Unknown error')
          // Add basic video anyway
          batchVideos.push(video)
          processedCount++
        }
      }
      
      // Insert batch into database
      if (batchVideos.length > 0) {
        console.log(`  💾 Inserting ${batchVideos.length} videos and ${batchSegments.length} segments...`)
        await db.updateVideoMetadata(batchVideos)
        if (batchSegments.length > 0) {
          await db.insertVideoSegments(batchSegments)
        }
      }
      
      console.log(`  📈 Progress: ${processedCount}/${videosToProcess.length} videos processed`)
    }
    
    // Step 4: Optimize database
    console.log('\n⚡ Step 3: Optimizing database...')
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

// CLI interface
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log('Build database with ALL videos from YouTube channel/playlist')
    console.log('')
    console.log('Usage:')
    console.log('  tsx build-all-videos.ts <url> [output-path] [options]')
    console.log('')
    console.log('Options:')
    console.log('  --max-videos <number>     Limit number of videos to process')
    console.log('  --skip-transcripts        Skip transcript extraction (faster)')
    console.log('  --batch-size <number>     Process videos in batches (default: 5)')
    console.log('')
    console.log('Examples:')
    console.log('  # Process ALL videos from a channel')
    console.log('  tsx build-all-videos.ts "https://www.youtube.com/@channelname"')
    console.log('')
    console.log('  # Process first 100 videos only')
    console.log('  tsx build-all-videos.ts "https://www.youtube.com/@channelname" ./videos.db --max-videos 100')
    console.log('')
    console.log('  # Skip transcripts for faster processing')
    console.log('  tsx build-all-videos.ts "https://www.youtube.com/@channelname" ./videos.db --skip-transcripts')
    console.log('')
    console.log('  # Process entire playlist')
    console.log('  tsx build-all-videos.ts "https://www.youtube.com/playlist?list=PLxxxxxx" ./playlist.db')
    process.exit(1)
  }
  
  const channelUrl = args[0]
  let outputPath = '../client-app/public/database/all-videos.db'
  let maxVideos: number | undefined
  let skipTranscripts = false
  let batchSize = 5
  
  // Parse arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--max-videos' && i + 1 < args.length) {
      maxVideos = parseInt(args[i + 1])
      i++
    } else if (arg === '--skip-transcripts') {
      skipTranscripts = true
    } else if (arg === '--batch-size' && i + 1 < args.length) {
      batchSize = parseInt(args[i + 1])
      i++
    } else if (!arg.startsWith('--')) {
      outputPath = arg
    }
  }
  
  try {
    await buildAllVideosDatabase(channelUrl, outputPath, {
      maxVideos,
      skipTranscripts,
      batchSize
    })
    
    console.log('🎉 Database build completed successfully!')
    console.log(`📍 Database location: ${outputPath}`)
    
  } catch (error) {
    console.error('💥 Database build failed:', error)
    process.exit(1)
  }
}

// Export for programmatic use
export { buildAllVideosDatabase }

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}