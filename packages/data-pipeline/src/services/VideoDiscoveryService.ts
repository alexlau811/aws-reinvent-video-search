/**
 * Video Discovery Service Implementation
 * 
 * Handles fetching video listings from YouTube channels using yt-dlp,
 * filtering for AWS re:Invent 2025 videos, and identifying new content.
 */

import YTDlpWrap from 'yt-dlp-wrap'
import type { VideoMetadata } from '@aws-reinvent-search/shared'
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
}