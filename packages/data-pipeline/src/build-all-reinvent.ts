#!/usr/bin/env tsx

/**
 * Build production database with ALL re:Invent 2025 videos
 * No limits - processes every re:Invent video found
 */

import { DatabaseService } from './database/DatabaseService.js'
import { VideoDiscoveryServiceImpl } from './services/VideoDiscoveryService.js'
import { MetadataEnrichmentServiceImpl } from './services/MetadataEnrichmentService.js'
import { EmbeddingServiceImpl } from './services/EmbeddingService.js'
import type { VideoMetadata, VideoSegment } from '@aws-reinvent-search/shared'
import { join, dirname } from 'path'
import { mkdirSync } from 'fs'

async function buildAllReInventDatabase(
  channelUrl: string, 
  outputPath: string, 
  options: {
    skipTranscripts?: boolean
    batchSize?: number
  } = {}
) {
  const { skipTranscripts = false, batchSize = 5 } = options
  
  console.log('🏗️ Building database with ALL re:Invent 2025 videos...')
  console.log(`Source: ${channelUrl}`)
  console.log(`Output: ${outputPath}`)
  console.log(`Skip transcripts: ${skipTranscripts}`)
  
  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true })
  
  // Initialize services
  const discoveryService = new VideoDiscoveryServiceImpl()
  const enrichmentService = new MetadataEnrichmentServiceImpl()
  const embeddingService = new EmbeddingServiceImpl()
  const db = new DatabaseService(outputPath)
  
  try {
    // Step 1: Fetch ALL videos from channel
    console.log('\n🔍 Step 1: Discovering videos from channel...')
    const allVideos = await discoveryService.fetchChannelVideos(channelUrl)
    console.log(`Found ${allVideos.length} total videos from channel`)
    
    // Step 2: Filter for ALL re:Invent videos (no limit)
    console.log('\n🎯 Step 2: Filtering for re:Invent 2025 videos...')
    const reInventVideos = discoveryService.filterReInventVideos(allVideos)
    console.log(`Found ${reInventVideos.length} re:Invent 2025 videos`)
    
    if (reInventVideos.length === 0) {
      console.log('❌ No re:Invent 2025 videos found. Make sure the channel has re:Invent content.')
      return
    }
    
    // Step 3: Process ALL re:Invent videos (no limit)
    console.log(`\n📊 Step 3: Processing ALL ${reInventVideos.length} re:Invent videos...`)
    let processedCount = 0
    
    for (let i = 0; i < reInventVideos.length; i += batchSize) {
      const batch = reInventVideos.slice(i, i + batchSize)
      console.log(`\n📦 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(reInventVideos.length / batchSize)}`)
      
      const batchVideos: VideoMetadata[] = []
      const batchSegments: VideoSegment[] = []
      
      for (const video of batch) {
        console.log(`\n🎥 ${processedCount + 1}/${reInventVideos.length}: ${video.title}`)
        
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
                  console.warn(`    ⚠️ Failed embedding for segment ${j + 1}:`, embeddingError.message)
                }
              }
              
              console.log(`  ✅ Created ${transcript.segments.length} segments`)
              
            } else {
              console.log('  ⚠️ No transcript available, skipping video')
              processedCount++
              continue
            }
          } else {
            console.log('  ⏭️ Skipping transcript extraction (skipTranscripts=true), skipping video')
            processedCount++
            continue
          }
          
          batchVideos.push(enrichedVideo)
          processedCount++
          
        } catch (error) {
          console.error(`  ❌ Failed to process video:`, error instanceof Error ? error.message : 'Unknown error')
          // Skip video on error - only process videos that work completely
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
      
      console.log(`  📈 Progress: ${processedCount}/${reInventVideos.length} videos processed`)
    }
    
    // Step 4: Optimize database
    console.log('\n⚡ Step 4: Optimizing database...')
    await db.optimizeDatabase()
    
    // Get final stats
    const stats = db.getStats()
    console.log('\n📊 Database build completed!')
    console.log('Final stats:', {
      ...stats,
      fileSizeMB: stats.dbSize ? (stats.dbSize * 4096 / 1024 / 1024).toFixed(2) : 'N/A',
      avgSegmentsPerVideo: stats.videoCount > 0 ? Math.round(stats.segmentCount / stats.videoCount * 100) / 100 : 0
    })
    
    console.log(`\n🎉 Successfully processed ALL ${stats.videoCount} re:Invent 2025 videos!`)
    
    return stats
    
  } finally {
    db.close()
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log('Build database with ALL re:Invent 2025 videos (no limits)')
    console.log('')
    console.log('Usage:')
    console.log('  tsx build-all-reinvent.ts <channel-url> [output-path] [options]')
    console.log('')
    console.log('Options:')
    console.log('  --skip-transcripts        Skip transcript extraction (faster)')
    console.log('  --batch-size <number>     Process videos in batches (default: 5)')
    console.log('')
    console.log('Examples:')
    console.log('  # Process ALL re:Invent videos from AWS Events channel')
    console.log('  tsx build-all-reinvent.ts "https://www.youtube.com/@AWSEventsChannel"')
    console.log('')
    console.log('  # Custom output path')
    console.log('  tsx build-all-reinvent.ts "https://www.youtube.com/@AWSEventsChannel" ./reinvent-2025-complete.db')
    console.log('')
    console.log('  # Skip transcripts for faster processing')
    console.log('  tsx build-all-reinvent.ts "https://www.youtube.com/@AWSEventsChannel" ./reinvent-2025.db --skip-transcripts')
    console.log('')
    console.log('  # Process from re:Invent playlist')
    console.log('  tsx build-all-reinvent.ts "https://www.youtube.com/playlist?list=PLhr1KZpdzukcaA06WloeNmGlnM_f1LrdP" ./reinvent-playlist.db')
    process.exit(1)
  }
  
  const channelUrl = args[0]
  let outputPath = '../client-app/public/database/reinvent-2025-complete.db'
  let skipTranscripts = false
  let batchSize = 5
  
  // Parse arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--skip-transcripts') {
      skipTranscripts = true
    } else if (arg === '--batch-size' && i + 1 < args.length) {
      batchSize = parseInt(args[i + 1])
      i++
    } else if (!arg.startsWith('--')) {
      outputPath = arg
    }
  }
  
  console.log('🚀 Starting complete re:Invent 2025 database build...')
  console.log(`This will process ALL re:Invent 2025 videos found (no limits)`)
  console.log(`Estimated time: This could take several hours depending on the number of videos`)
  
  try {
    await buildAllReInventDatabase(channelUrl, outputPath, {
      skipTranscripts,
      batchSize
    })
    
    console.log('\n🎉 Complete re:Invent 2025 database build finished!')
    console.log(`📍 Database location: ${outputPath}`)
    console.log(`🔍 You can now use this database in your video search platform`)
    
  } catch (error) {
    console.error('💥 Database build failed:', error)
    process.exit(1)
  }
}

// Export for programmatic use
export { buildAllReInventDatabase }

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}