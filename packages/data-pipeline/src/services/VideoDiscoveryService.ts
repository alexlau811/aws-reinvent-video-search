/**
 * Video Discovery Service Implementation
 *
 * Handles fetching video listings from YouTube channels using yt-dlp,
 * filtering for AWS re:Invent 2025 videos, and extracting transcripts.
 */

import YTDlpWrap from 'yt-dlp-wrap'
import type { VideoMetadata, Transcript } from '@aws-reinvent-search/shared'
import { VideoProcessingError } from '@aws-reinvent-search/shared'
import type { VideoDiscoveryService } from '../interfaces/index.js'
import path from 'path'

export class VideoDiscoveryServiceImpl implements VideoDiscoveryService {
  private ytDlp: YTDlpWrap

  constructor() {
    // Handle both CommonJS and ES module imports
    const YTDlpClass = (YTDlpWrap as any).default || YTDlpWrap
    this.ytDlp = new YTDlpClass()
  }

  /**
   * Fetches video listings from a YouTube channel using yt-dlp
   */
  async fetchChannelVideos(channelUrl: string): Promise<VideoMetadata[]> {
    try {
      const result = await this.ytDlp.execPromise([
        channelUrl,
        '--flat-playlist',
        '--dump-json',
        '--playlist-end', '200',
        '--no-warnings'
      ])

      const lines = result.split('\n').filter(line => line.trim())
      const videos: VideoMetadata[] = []

      for (const line of lines) {
        try {
          const videoData = JSON.parse(line)

          if (!videoData.id || !videoData.title) {
            continue
          }

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
   */
  filterReInventVideos(videos: VideoMetadata[]): VideoMetadata[] {
    return videos.filter(video => {
      const title = video.title.toLowerCase()
      return title.startsWith('aws re:invent 2025')
    })
  }

  /**
   * Identifies new videos that are not present in the existing database
   */
  identifyNewVideos(videos: VideoMetadata[], existing: VideoMetadata[]): VideoMetadata[] {
    const existingIds = new Set(existing.map(video => video.id))
    return videos.filter(video => !existingIds.has(video.id))
  }

  /**
   * Parses yt-dlp upload date format (YYYYMMDD) to Date object
   */
  private parseUploadDate(uploadDate: string): Date {
    if (uploadDate.length === 8) {
      const year = parseInt(uploadDate.substring(0, 4))
      const month = parseInt(uploadDate.substring(4, 6)) - 1
      const day = parseInt(uploadDate.substring(6, 8))
      return new Date(year, month, day)
    }
    return new Date()
  }

  /**
   * Extracts the best quality thumbnail URL from yt-dlp thumbnails array
   */
  private extractThumbnailUrl(thumbnails: any[]): string {
    if (!thumbnails || thumbnails.length === 0) {
      return ''
    }

    const sortedThumbnails = thumbnails
      .filter(thumb => thumb.url && thumb.width && thumb.height)
      .sort((a, b) => (b.width * b.height) - (a.width * a.height))

    return sortedThumbnails.length > 0 ? sortedThumbnails[0].url : ''
  }

  /**
   * Validates that yt-dlp is available and working
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
   */
  async updateYtDlp(): Promise<void> {
    try {
      await this.ytDlp.execPromise(['-U'])
    } catch (error) {
      console.warn('Failed to update yt-dlp:', error)
    }
  }

  /**
   * Extract transcript from a YouTube video using yt-dlp
   */
  async extractTranscript(videoId: string): Promise<Transcript | null> {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`

      // Check if subtitles are available
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

      const hasSubtitles = videoInfo.subtitles || videoInfo.automatic_captions
      if (!hasSubtitles) {
        console.log(`No subtitles available for video ${videoId}`)
        return null
      }

      // Download subtitles
      console.log(`Downloading subtitles for video ${videoId}`)

      const tempDir = '/tmp'
      const tempFilename = `transcript_${videoId}`
      let vttContent: string

      try {
        await this.ytDlp.execPromise([
          videoUrl,
          '--write-subs',
          '--write-auto-subs',
          '--sub-format', 'vtt',
          '--skip-download',
          '-o', `${tempDir}/${tempFilename}`,
          '--no-warnings'
        ])

        const fs = await import('fs')

        const files = fs.readdirSync(tempDir)
        const vttFilePath = files.find(file =>
          file.startsWith(path.basename(tempFilename)) && file.endsWith('.vtt')
        )

        if (vttFilePath) {
          vttContent = fs.readFileSync(`${tempDir}/${vttFilePath}`, 'utf8')

          // Clean up temp file
          try {
            fs.unlinkSync(`${tempDir}/${vttFilePath}`)
          } catch (cleanupError) {
            console.warn(`Could not clean up temp file ${vttFilePath}:`, cleanupError)
          }

          if (!vttContent || vttContent.trim() === '') {
            console.log(`Empty subtitle content for video ${videoId}`)
            return null
          }

          // Parse VTT into simple segments
          const segments = this.parseVTTContent(vttContent)

          if (segments.length === 0) {
            console.log(`No transcript segments found for video ${videoId}`)
            return null
          }

          return {
            videoId,
            language: 'en',
            confidence: 0.8,
            segments
          }
        } else {
          console.log(`Could not find VTT file for ${videoId}`)
          return null
        }
      } catch (subtitleError) {
        console.log(`Failed to download subtitles for video ${videoId}:`, subtitleError)
        return null
      }
    } catch (error) {
      console.warn(`Failed to extract transcript for video ${videoId}:`, error)
      return null
    }
  }

  /**
   * Parse VTT subtitle content into transcript segments
   */
  private parseVTTContent(vttContent: string): Array<{
    startTime: number
    endTime: number
    text: string
    confidence: number
  }> {
    const segments: Array<{
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

      const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/)

      if (timestampMatch) {
        const startTime = this.parseTimestamp(timestampMatch[1])
        const endTime = this.parseTimestamp(timestampMatch[2])

        i++
        const textLines: string[] = []

        while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
          const textLine = lines[i].trim()
          if (textLine) {
            const cleanText = textLine.replace(/<[^>]*>/g, '').trim()
            if (cleanText) {
              textLines.push(cleanText)
            }
          }
          i++
        }

        if (textLines.length > 0) {
          segments.push({
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

    console.log(`Parsed ${segments.length} VTT segments`)
    return segments
  }

  /**
   * Parse timestamp string to seconds
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
   */
  async getTranscriptText(videoId: string): Promise<string | null> {
    const transcript = await this.extractTranscript(videoId)

    if (!transcript || !transcript.segments || transcript.segments.length === 0) {
      return null
    }

    return transcript.segments.map(segment => segment.text).join(' ')
  }
}
