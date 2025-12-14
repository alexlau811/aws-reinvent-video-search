/**
 * Example usage of VideoDiscoveryService
 * 
 * This demonstrates how to use the VideoDiscoveryService to:
 * 1. Fetch videos from AWS Events Channel
 * 2. Filter for re:Invent 2025 content
 * 3. Identify new videos for processing
 */

import { VideoDiscoveryServiceImpl } from '../services/VideoDiscoveryService.js'

async function demonstrateVideoDiscovery() {
  const service = new VideoDiscoveryServiceImpl()

  try {
    // Validate yt-dlp is available
    const isYtDlpAvailable = await service.validateYtDlp()
    if (!isYtDlpAvailable) {
      console.error('yt-dlp is not available. Please install it first.')
      return
    }

    console.log('✓ yt-dlp is available')

    // AWS Events Channel URL
    const channelUrl = 'https://www.youtube.com/@AWSEventsChannel'
    
    console.log(`Fetching videos from: ${channelUrl}`)
    
    // Fetch channel videos - this makes actual network requests to YouTube
    console.log('Fetching videos from AWS Events Channel...')
    const allVideos = await service.fetchChannelVideos(channelUrl)
    console.log(`Found ${allVideos.length} total videos`)

    if (allVideos.length === 0) {
      console.log('No videos found. This might be due to network issues or channel access restrictions.')
      return
    }

    // Show sample of all videos found
    console.log('\nSample of all videos found:')
    allVideos.slice(0, 5).forEach((video, index) => {
      console.log(`  ${index + 1}. ${video.title} (${video.id})`)
    })

    console.log(`\nFiltering for re:Invent 2025 videos...`)
    const reInventVideos = service.filterReInventVideos(allVideos)
    console.log(`Found ${reInventVideos.length} re:Invent 2025 videos out of ${allVideos.length} total videos`)
    
    if (reInventVideos.length > 0) {
      console.log('\nre:Invent 2025 videos found:')
      reInventVideos.forEach((video, index) => {
        console.log(`  ${index + 1}. ${video.title}`)
        console.log(`     ID: ${video.id}`)
        console.log(`     Duration: ${Math.floor(video.duration / 60)} minutes`)
        console.log(`     Published: ${video.publishedAt.toDateString()}`)
        console.log(`     URL: ${video.youtubeUrl}`)
        console.log('')
      })
    } else {
      console.log('No re:Invent 2025 videos found in the current channel listing.')
      console.log('This might be because:')
      console.log('  - re:Invent 2025 videos haven\'t been uploaded yet')
      console.log('  - Videos are titled differently than expected')
      console.log('  - We\'re only fetching the most recent 200 videos')
    }

    // For demonstration of new video identification, let's simulate some existing videos
    // In a real implementation, this would come from the database
    const existingVideoIds = reInventVideos.length > 0 ? [reInventVideos[0].id] : []
    const simulatedExistingVideos = reInventVideos.filter(video => 
      existingVideoIds.includes(video.id)
    )

    console.log(`\nIdentifying new videos (simulating ${simulatedExistingVideos.length} existing videos)...`)
    const newVideos = service.identifyNewVideos(reInventVideos, simulatedExistingVideos)
    console.log(`Found ${newVideos.length} new videos to process`)
    
    if (newVideos.length > 0) {
      console.log('\nNew videos that would be processed:')
      newVideos.forEach((video, index) => {
        console.log(`  ${index + 1}. ${video.title} (${video.id})`)
      })
    }

    console.log('\n✓ Video discovery demonstration completed successfully')

  } catch (error) {
    console.error('Error during video discovery:', error)
  }
}

// Run the demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateVideoDiscovery()
}