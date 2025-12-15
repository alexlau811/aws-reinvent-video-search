#!/usr/bin/env tsx

/**
 * Build database with re:Invent videos
 * Simplified: keyword/regex extraction only, no embeddings/segments
 */

import { DatabaseService } from './database/DatabaseService.js'
import { VideoDiscoveryServiceImpl } from './services/VideoDiscoveryService.js'
import { MetadataEnrichmentServiceImpl } from './services/MetadataEnrichmentService.js'
import type { VideoMetadata } from '@aws-reinvent-search/shared'
import { dirname } from 'path'
import { mkdirSync } from 'fs'

async function buildDatabase(
  channelUrl: string,
  outputPath: string,
  options: {
    maxVideos?: number
    filterReInvent?: boolean
    batchSize?: number
  } = {}
) {
  const { maxVideos, filterReInvent = true, batchSize = 10 } = options

  console.log('🏗️ Building video database...')
  console.log(`Source: ${channelUrl}`)
  console.log(`Output: ${outputPath}`)
  console.log(`Filter re:Invent only: ${filterReInvent}`)
  console.log(`Max videos: ${maxVideos || 'unlimited'}`)

  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true })

  // Initialize services
  const discoveryService = new VideoDiscoveryServiceImpl()
  const enrichmentService = new MetadataEnrichmentServiceImpl()
  const db = new DatabaseService(outputPath)

  try {
    // Step 1: Fetch videos from channel/playlist
    console.log('\n🔍 Step 1: Discovering videos...')
    const allVideos = await discoveryService.fetchChannelVideos(channelUrl)
    console.log(`Found ${allVideos.length} total videos`)

    // Step 2: Filter for re:Invent if requested
    let videosToProcess = filterReInvent
      ? discoveryService.filterReInventVideos(allVideos)
      : allVideos
    console.log(`Videos after filtering: ${videosToProcess.length}`)

    // Step 3: Apply max limit
    if (maxVideos) {
      videosToProcess = videosToProcess.slice(0, maxVideos)
    }
    console.log(`Processing ${videosToProcess.length} videos`)

    if (videosToProcess.length === 0) {
      console.log('❌ No videos to process')
      return
    }

    // Step 4: Process videos in batches
    console.log('\n📊 Step 2: Extracting metadata...')
    let processedCount = 0

    for (let i = 0; i < videosToProcess.length; i += batchSize) {
      const batch = videosToProcess.slice(i, i + batchSize)
      console.log(`\n📦 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(videosToProcess.length / batchSize)}`)

      const enrichedVideos: VideoMetadata[] = []

      for (const video of batch) {
        console.log(`  🎥 ${processedCount + 1}/${videosToProcess.length}: ${video.title.substring(0, 60)}...`)

        try {
          // Try to extract transcript for better metadata
          let transcriptText: string | null = null
          try {
            transcriptText = await discoveryService.getTranscriptText(video.id)
            if (transcriptText) {
              console.log(`    ✅ Found transcript`)
            }
          } catch (e) {
            console.log(`    ⚠️ No transcript available`)
          }

          // Extract metadata from video info
          const videoMetadata = await enrichmentService.extractFromVideoMetadata(video)

          // If we have transcript, extract from that too and combine
          let finalMetadata = videoMetadata
          if (transcriptText) {
            const transcriptMetadata = await enrichmentService.extractFromTranscript(transcriptText)
            finalMetadata = {
              ...transcriptMetadata,
              ...enrichmentService.combineMetadata(transcriptMetadata, videoMetadata)
            }
          }

          // Extract level from title session code (e.g., SEC301)
          const titleLevel = enrichmentService.extractLevelFromTitle(video.title)
          const finalLevel = titleLevel !== 'Unknown' ? titleLevel : finalMetadata.inferredLevel

          // Create enriched video
          const enrichedVideo: VideoMetadata = {
            ...video,
            level: finalLevel,
            services: finalMetadata.inferredServices,
            topics: finalMetadata.inferredTopics,
            industry: [],
            sessionType: finalMetadata.sessionType,
            speakers: finalMetadata.speakers,
            metadataSource: transcriptText ? 'combined' : 'video-metadata',
            metadataConfidence: finalMetadata.confidence,
            extractedKeywords: finalMetadata.keyTerms
          }

          enrichedVideos.push(enrichedVideo)
          processedCount++

        } catch (error) {
          console.error(`    ❌ Failed:`, error instanceof Error ? error.message : 'Unknown error')
          processedCount++
        }
      }

      // Insert batch into database
      if (enrichedVideos.length > 0) {
        console.log(`  💾 Inserting ${enrichedVideos.length} videos...`)
        await db.updateVideoMetadata(enrichedVideos)
      }

      console.log(`  📈 Progress: ${processedCount}/${videosToProcess.length}`)
    }

    // Step 5: Optimize database
    console.log('\n⚡ Step 3: Optimizing database...')
    await db.optimizeDatabase()

    // Get final stats
    const stats = db.getStats()
    console.log('\n📊 Database build completed!')
    console.log('Final stats:', {
      videoCount: stats.videoCount,
      fileSizeMB: stats.dbSize ? (stats.dbSize * 4096 / 1024 / 1024).toFixed(2) : 'N/A'
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
    console.log('Build video database with keyword/regex extraction')
    console.log('')
    console.log('Usage:')
    console.log('  tsx build-database.ts <url> [output-path] [options]')
    console.log('')
    console.log('Options:')
    console.log('  --max <number>         Limit number of videos')
    console.log('  --all                  Include all videos (not just re:Invent)')
    console.log('  --batch <number>       Batch size (default: 10)')
    console.log('')
    console.log('Examples:')
    console.log('  # Build from AWS Events channel (re:Invent videos only)')
    console.log('  tsx build-database.ts "https://www.youtube.com/@AWSEventsChannel"')
    console.log('')
    console.log('  # Build from playlist with limit')
    console.log('  tsx build-database.ts "https://www.youtube.com/playlist?list=PLhr1KZpdzukcaA06WloeNmGlnM_f1LrdP" ./reinvent.db --max 50')
    console.log('')
    console.log('  # Build all videos (no filtering)')
    console.log('  tsx build-database.ts "https://www.youtube.com/@channelname" ./all-videos.db --all')
    process.exit(1)
  }

  const channelUrl = args[0]
  let outputPath = '../client-app/public/database/reinvent-videos.db'
  let maxVideos: number | undefined
  let filterReInvent = true
  let batchSize = 10

  // Parse arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--max' && i + 1 < args.length) {
      maxVideos = parseInt(args[i + 1])
      i++
    } else if (arg === '--all') {
      filterReInvent = false
    } else if (arg === '--batch' && i + 1 < args.length) {
      batchSize = parseInt(args[i + 1])
      i++
    } else if (!arg.startsWith('--')) {
      outputPath = arg
    }
  }

  try {
    await buildDatabase(channelUrl, outputPath, {
      maxVideos,
      filterReInvent,
      batchSize
    })

    console.log('\n🎉 Database build completed successfully!')
    console.log(`📍 Database location: ${outputPath}`)

  } catch (error) {
    console.error('💥 Database build failed:', error)
    process.exit(1)
  }
}

// Export for programmatic use
export { buildDatabase }

// Run if called directly
main().catch(console.error)
