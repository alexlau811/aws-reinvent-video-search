/**
 * Video Discovery Service Implementation
 * 
 * Handles fetching video listings from YouTube channels using yt-dlp,
 * filtering for AWS re:Invent 2025 videos, and identifying new content.
 */

import YTDlpWrap from 'yt-dlp-wrap'
import type { VideoMetadata, Transcript } from '@aws-reinvent-search/shared'
import { VideoProcessingError } from '@aws-reinvent-search/shared'
import type { VideoDiscoveryService } from '../interfaces/index.js'

export class VideoDiscoveryServiceImpl implements VideoDiscoveryService {
  private ytDlp: YTDlpWrap

  constructor() {
    // Handle both CommonJS and ES module imports
    const YTDlpClass = (YTDlpWrap as any).default || YTDlpWrap
    this.ytDlp = new YTDlpClass()
  }

  /**
   * Fetches video listings from a YouTube channel using yt-dlp
   * @param channelUrl - The YouTube channel URL to fetch videos from
   * @returns Promise<VideoMetadata[]> - Array of video metadata
   */
  async fetchChannelVideos(channelUrl: string): Promise<VideoMetadata[]> {
    try {
      // Use yt-dlp to extract video information from the channel
      // --flat-playlist: Don't download, just extract metadata
      // --dump-json: Output metadata as JSON
      // --playlist-end: Limit to recent videos (last 200)
      const result = await this.ytDlp.execPromise([
        channelUrl,
        '--flat-playlist',
        '--dump-json',
        '--playlist-end', '200',
        '--no-warnings'
      ])

      // Parse the JSON output - yt-dlp outputs one JSON object per line
      const lines = result.split('\n').filter(line => line.trim())
      const videos: VideoMetadata[] = []

      for (const line of lines) {
        try {
          const videoData = JSON.parse(line)
          
          // Skip if this is not a video entry
          if (!videoData.id || !videoData.title) {
            continue
          }

          // Convert yt-dlp output to our VideoMetadata format
          const videoMetadata: VideoMetadata = {
            id: videoData.id,
            title: videoData.title,
            description: videoData.description || '',
            channelId: videoData.channel_id || videoData.uploader_id || '',
            channelTitle: videoData.channel || videoData.uploader || '',
            publishedAt: videoData.upload_date ? this.parseUploadDate(videoData.upload_date) : new Date(),
            duration: videoData.duration || 0,
            thumbnailUrl: this.extractThumbnailUrl(videoData.thumbnails),
            youtubeUrl: `https://www.youtube.com/watch?v=${videoData.id}`,
            
            // Initialize enriched metadata with defaults
            level: 'Unknown',
            services: [],
            topics: [],
            industry: [],
            sessionType: 'Unknown',
            speakers: [],
            
            // Metadata source tracking
            metadataSource: 'transcript',
            metadataConfidence: 0.0,
            extractedKeywords: []
          }

          videos.push(videoMetadata)
        } catch (parseError) {
          console.warn(`Failed to parse video metadata line: ${line}`, parseError)
          continue
        }
      }

      return videos
    } catch (error) {
      throw new VideoProcessingError(
        `Failed to fetch channel videos from ${channelUrl}`,
        'unknown',
        'discovery',
        error as Error
      )
    }
  }

  /**
   * Filters videos to only include AWS re:Invent 2025 content
   * @param videos - Array of video metadata to filter
   * @returns VideoMetadata[] - Filtered array containing only re:Invent 2025 videos
   */
  filterReInventVideos(videos: VideoMetadata[]): VideoMetadata[] {
    return videos.filter(video => {
      // Check if title starts with "AWS re:Invent 2025" (case insensitive)
      const title = video.title.toLowerCase()
      return title.startsWith('aws re:invent 2025')
    })
  }

  /**
   * Identifies new videos that are not present in the existing database
   * @param videos - Array of discovered videos
   * @param existing - Array of existing videos in the database
   * @returns VideoMetadata[] - Array of new videos not in the existing set
   */
  identifyNewVideos(videos: VideoMetadata[], existing: VideoMetadata[]): VideoMetadata[] {
    const existingIds = new Set(existing.map(video => video.id))
    return videos.filter(video => !existingIds.has(video.id))
  }

  /**
   * Parses yt-dlp upload date format (YYYYMMDD) to Date object
   * @param uploadDate - Upload date string from yt-dlp
   * @returns Date - Parsed date object
   */
  private parseUploadDate(uploadDate: string): Date {
    // yt-dlp returns dates in YYYYMMDD format
    if (uploadDate.length === 8) {
      const year = parseInt(uploadDate.substring(0, 4))
      const month = parseInt(uploadDate.substring(4, 6)) - 1 // Month is 0-indexed
      const day = parseInt(uploadDate.substring(6, 8))
      return new Date(year, month, day)
    }
    
    // Fallback to current date if parsing fails
    return new Date()
  }

  /**
   * Extracts the best quality thumbnail URL from yt-dlp thumbnails array
   * @param thumbnails - Array of thumbnail objects from yt-dlp
   * @returns string - Best quality thumbnail URL or empty string
   */
  private extractThumbnailUrl(thumbnails: any[]): string {
    if (!thumbnails || thumbnails.length === 0) {
      return ''
    }

    // Sort by resolution (width * height) and pick the highest quality
    const sortedThumbnails = thumbnails
      .filter(thumb => thumb.url && thumb.width && thumb.height)
      .sort((a, b) => (b.width * b.height) - (a.width * a.height))

    return sortedThumbnails.length > 0 ? sortedThumbnails[0].url : ''
  }

  /**
   * Validates that yt-dlp is available and working
   * @returns Promise<boolean> - True if yt-dlp is available
   */
  async validateYtDlp(): Promise<boolean> {
    try {
      await this.ytDlp.execPromise(['--version'])
      return true
    } catch (error) {
      console.error('yt-dlp validation failed:', error)
      return false
    }
  }

  /**
   * Updates yt-dlp to the latest version
   * @returns Promise<void>
   */
  async updateYtDlp(): Promise<void> {
    try {
      await this.ytDlp.execPromise(['-U'])
    } catch (error) {
      console.warn('Failed to update yt-dlp:', error)
      // Don't throw - this is not critical for functionality
    }
  }

  /**
   * Extract transcript from a YouTube video using yt-dlp
   * @param videoId - The YouTube video ID
   * @returns Promise<Transcript | null> - Extracted transcript or null if not available
   */
  async extractTranscript(videoId: string): Promise<Transcript | null> {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
      
      // First, check if subtitles are available
      const infoResult = await this.ytDlp.execPromise([
        videoUrl,
        '--dump-json',
        '--no-warnings'
      ])

      if (!infoResult || infoResult.trim() === '') {
        console.log(`Could not get video info for ${videoId}`)
        return null
      }

      const videoInfo = JSON.parse(infoResult)
      
      // Check if subtitles are available
      const hasSubtitles = videoInfo.subtitles || videoInfo.automatic_captions
      if (!hasSubtitles) {
        console.log(`No subtitles available for video ${videoId}`)
        return null
      }

      // Use yt-dlp to download the subtitle file to a temporary location
      console.log(`Downloading subtitles for video ${videoId}`)
      
      const tempDir = '/tmp'
      const tempFilename = `transcript_${videoId}`
      let vttContent: string
      
      try {
        // Use yt-dlp to write subtitles to temp directory
        await this.ytDlp.execPromise([
          videoUrl,
          '--write-subs',
          '--write-auto-subs', 
          // '--sub-langs', 'en',
          '--sub-format', 'vtt',
          '--skip-download',
          '-o', `${tempDir}/${tempFilename}`,
          '--no-warnings'
        ])

        // Read the VTT file that was created
        const fs = await import('fs')
        const vttFilePath = `${tempDir}/${tempFilename}.en.vtt`
        
        try {
          vttContent = fs.readFileSync(vttFilePath, 'utf8')
        } catch (readError) {
          console.log(`Could not read VTT file at ${vttFilePath}:`, readError)
          return null
        }
        
        // Clean up the temporary file
        try {
          fs.unlinkSync(vttFilePath)
        } catch (cleanupError) {
          console.warn(`Could not clean up temp file ${vttFilePath}:`, cleanupError)
        }
        
        if (!vttContent || vttContent.trim() === '') {
          console.log(`Empty subtitle content for video ${videoId}`)
          return null
        }
        
      } catch (subtitleError) {
        console.log(`Failed to download subtitles for video ${videoId}:`, subtitleError)
        return null
      }
      
      // Parse the VTT content into transcript segments
      const segments = this.parseVTTContent(vttContent)
      
      if (segments.length === 0) {
        console.log(`No transcript segments found for video ${videoId}`)
        return null
      }

      return {
        videoId,
        language: 'en',
        confidence: 0.8, // Moderate confidence for subtitles
        segments
      }
      
    } catch (error) {
      console.warn(`Failed to extract transcript for video ${videoId}:`, error)
      return null
    }
  }

  /**
   * Consolidate VTT segments into chunks of at least minChars characters
   * @param segments - Array of VTT segments to consolidate
   * @param minChars - Minimum character threshold for each chunk (default: 1000)
   * @returns Array of consolidated segments
   */
  private consolidateSegments(
    segments: Array<{
      startTime: number
      endTime: number
      text: string
      confidence: number
    }>,
    minChars: number = 1000
  ): Array<{
    startTime: number
    endTime: number
    text: string
    confidence: number
  }> {
    if (segments.length === 0) {
      return []
    }

    // Handle edge case where total transcript is under minChars
    const totalText = segments.map(s => s.text).join(' ')
    if (totalText.length < minChars) {
      return [{
        startTime: segments[0].startTime,
        endTime: segments[segments.length - 1].endTime,
        text: totalText,
        confidence: segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length
      }]
    }

    const consolidated: Array<{
      startTime: number
      endTime: number
      text: string
      confidence: number
    }> = []

    let currentChunk = {
      startTime: segments[0].startTime,
      endTime: segments[0].endTime,
      text: segments[0].text,
      confidence: segments[0].confidence,
      segmentCount: 1
    }

    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i]
      const potentialText = currentChunk.text + ' ' + segment.text

      // If current chunk is still under threshold, keep adding
      if (currentChunk.text.length < minChars) {
        currentChunk.text = potentialText
        currentChunk.endTime = segment.endTime
        currentChunk.confidence = (currentChunk.confidence * currentChunk.segmentCount + segment.confidence) / (currentChunk.segmentCount + 1)
        currentChunk.segmentCount++
      } else {
        // Current chunk has reached minimum threshold, save it and start a new one
        consolidated.push({
          startTime: currentChunk.startTime,
          endTime: currentChunk.endTime,
          text: currentChunk.text,
          confidence: currentChunk.confidence
        })

        currentChunk = {
          startTime: segment.startTime,
          endTime: segment.endTime,
          text: segment.text,
          confidence: segment.confidence,
          segmentCount: 1
        }
      }
    }

    // Add the final chunk
    consolidated.push({
      startTime: currentChunk.startTime,
      endTime: currentChunk.endTime,
      text: currentChunk.text,
      confidence: currentChunk.confidence
    })

    return consolidated
  }

  /**
   * Split a segment at sentence boundaries if it exceeds embedding model limits
   * @param segment - The segment to potentially split
   * @param maxTokens - Maximum tokens allowed (default: 8192)
   * @returns Array of split segments or original segment if under limit
   */
  private splitAtSentenceBoundaries(
    segment: {
      startTime: number
      endTime: number
      text: string
      confidence: number
    },
    maxTokens: number = 8192
  ): Array<{
    startTime: number
    endTime: number
    text: string
    confidence: number
  }> {
    // Rough estimation: 1 token ≈ 4 characters for English text
    const estimatedTokens = segment.text.length / 4
    
    // If segment is under the limit, return as-is
    if (estimatedTokens <= maxTokens) {
      return [segment]
    }

    // Split at sentence boundaries: period, question mark, or exclamation mark followed by space
    const sentences = segment.text.split(/([.!?]\s+)/).filter(part => part.trim().length > 0)
    
    if (sentences.length <= 1) {
      // No sentence boundaries found, return original segment
      return [segment]
    }

    const splitSegments: Array<{
      startTime: number
      endTime: number
      text: string
      confidence: number
    }> = []

    let currentText = ''
    const segmentDuration = segment.endTime - segment.startTime
    let segmentStartTime = segment.startTime

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i]
      const potentialText = currentText + sentence

      // Check if adding this sentence would exceed the token limit
      const potentialTokens = potentialText.length / 4
      
      if (potentialTokens > maxTokens && currentText.trim().length > 0) {
        // Current text has reached the limit, save it as a segment
        const textProgress = currentText.length / segment.text.length
        const segmentEndTime = segment.startTime + (segmentDuration * textProgress)
        
        splitSegments.push({
          startTime: segmentStartTime,
          endTime: segmentEndTime,
          text: currentText.trim(),
          confidence: segment.confidence
        })

        // Start new segment
        currentText = sentence
        segmentStartTime = segmentEndTime
      } else {
        currentText = potentialText
      }
    }

    // Add the final segment
    if (currentText.trim().length > 0) {
      splitSegments.push({
        startTime: segmentStartTime,
        endTime: segment.endTime,
        text: currentText.trim(),
        confidence: segment.confidence
      })
    }

    return splitSegments.length > 0 ? splitSegments : [segment]
  }

  /**
   * Parse VTT subtitle content into transcript segments
   * @param vttContent - Raw VTT subtitle content
   * @returns TranscriptSegment[] - Parsed segments with timestamps
   * 
   * Note: This method is prepared for future use when subtitle content extraction is fully implemented.
   * Currently, the extractTranscript method returns null when subtitles are detected but not extractable
   * due to filesystem access limitations in the yt-dlp-wrap library.
   */
  private parseVTTContent(vttContent: string): Array<{
    startTime: number
    endTime: number
    text: string
    confidence: number
  }> {
    const rawSegments: Array<{
      startTime: number
      endTime: number
      text: string
      confidence: number
    }> = []
    
    const lines = vttContent.split('\n')
    let i = 0
    
    // Skip VTT header
    while (i < lines.length && !lines[i].includes('-->')) {
      i++
    }
    
    while (i < lines.length) {
      const line = lines[i].trim()
      
      // Look for timestamp line (format: 00:00:01.000 --> 00:00:03.000)
      const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/)
      
      if (timestampMatch) {
        const startTime = this.parseTimestamp(timestampMatch[1])
        const endTime = this.parseTimestamp(timestampMatch[2])
        
        // Get the text content (next non-empty lines until next timestamp or end)
        i++
        const textLines: string[] = []
        
        while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
          const textLine = lines[i].trim()
          if (textLine) {
            // Remove VTT formatting tags
            const cleanText = textLine.replace(/<[^>]*>/g, '').trim()
            if (cleanText) {
              textLines.push(cleanText)
            }
          }
          i++
        }
        
        if (textLines.length > 0) {
          rawSegments.push({
            startTime,
            endTime,
            text: textLines.join(' '),
            confidence: 0.8
          })
        }
      } else {
        i++
      }
    }
    
    console.log(`Parsed ${rawSegments.length} raw VTT segments`)
    
    // Consolidate segments into chunks of at least 1000 characters
    const consolidatedSegments = this.consolidateSegments(rawSegments)
    
    console.log(`Consolidated into ${consolidatedSegments.length} segments`)
    if (consolidatedSegments.length > 0) {
      console.log(`First consolidated segment: "${consolidatedSegments[0].text.substring(0, 50)}..."`)
    }
    
    return consolidatedSegments
  }

  /**
   * Parse timestamp string to seconds
   * @param timestamp - Timestamp in format HH:MM:SS.mmm
   * @returns number - Timestamp in seconds
   */
  private parseTimestamp(timestamp: string): number {
    const parts = timestamp.split(':')
    const hours = parseInt(parts[0])
    const minutes = parseInt(parts[1])
    const secondsParts = parts[2].split('.')
    const seconds = parseInt(secondsParts[0])
    const milliseconds = parseInt(secondsParts[1])
    
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
  }

  /**
   * Get full transcript text from video
   * @param videoId - The YouTube video ID
   * @returns Promise<string | null> - Full transcript text or null if not available
   */
  async getTranscriptText(videoId: string): Promise<string | null> {
    const transcript = await this.extractTranscript(videoId)
    
    if (!transcript || !transcript.segments || transcript.segments.length === 0) {
      return null
    }
    
    // Combine all segment text into a single string
    return transcript.segments.map(segment => segment.text).join(' ')
  }
}