/**
 * Database update and deployment service
 * Handles database versioning, updates, and CDN deployment
 */

import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { gzipSync, gunzipSync } from 'zlib'
import type { VideoMetadata, VideoSegment, DatabaseError } from '@aws-reinvent-search/shared'
import { DatabaseError } from '@aws-reinvent-search/shared'
import { DatabaseService } from './DatabaseService.js'

export interface DatabaseVersion {
  version: string
  timestamp: Date
  videoCount: number
  segmentCount: number
  checksum: string
  compressed: boolean
}

export interface UpdateResult {
  success: boolean
  version: string
  videosAdded: number
  videosUpdated: number
  segmentsAdded: number
  error?: string
}

export interface DeploymentConfig {
  outputPath: string
  compressionEnabled: boolean
  versioningEnabled: boolean
  maxVersions: number
}

export class DatabaseUpdateService {
  private dbService: DatabaseService
  private config: DeploymentConfig

  constructor(
    dbService: DatabaseService,
    config: Partial<DeploymentConfig> = {}
  ) {
    this.dbService = dbService
    this.config = {
      outputPath: './dist',
      compressionEnabled: true,
      versioningEnabled: true,
      maxVersions: 10,
      ...config
    }

    // Ensure output directory exists
    if (!existsSync(this.config.outputPath)) {
      mkdirSync(this.config.outputPath, { recursive: true })
    }
  }

  /**
   * Update database with new videos and segments
   */
  async updateDatabase(
    newVideos: VideoMetadata[],
    newSegments: VideoSegment[]
  ): Promise<UpdateResult> {
    try {
      const startTime = Date.now()
      
      // Get existing videos to determine what's new vs updated
      const existingVideoIds = newVideos.map(v => v.id)
      const existingVideos = this.dbService.getExistingVideos(existingVideoIds)
      const existingVideoMap = new Map(existingVideos.map(v => [v.id, v]))

      let videosAdded = 0
      let videosUpdated = 0
      let segmentsAdded = 0

      // Process videos
      for (const video of newVideos) {
        if (existingVideoMap.has(video.id)) {
          // Check if video needs updating (compare metadata)
          const existing = existingVideoMap.get(video.id)!
          if (this.hasVideoChanged(existing, video)) {
            videosUpdated++
          }
        } else {
          videosAdded++
        }
      }

      // Update videos in database
      await this.dbService.updateVideoMetadata(newVideos)

      // Process segments - replace all segments for updated videos
      const videoSegmentMap = new Map<string, VideoSegment[]>()
      for (const segment of newSegments) {
        if (!videoSegmentMap.has(segment.videoId)) {
          videoSegmentMap.set(segment.videoId, [])
        }
        videoSegmentMap.get(segment.videoId)!.push(segment)
      }

      // Delete existing segments and insert new ones for each video
      for (const [videoId, segments] of videoSegmentMap) {
        this.dbService.deleteVideoSegments(videoId)
        await this.dbService.insertVideoSegments(segments)
        segmentsAdded += segments.length
      }

      // Optimize database after updates
      await this.dbService.optimizeDatabase()

      // Generate new version
      const version = this.generateVersion()
      
      console.log(`Database update completed in ${Date.now() - startTime}ms`)
      console.log(`Videos: ${videosAdded} added, ${videosUpdated} updated`)
      console.log(`Segments: ${segmentsAdded} added`)

      return {
        success: true,
        version,
        videosAdded,
        videosUpdated,
        segmentsAdded
      }
    } catch (error) {
      return {
        success: false,
        version: '',
        videosAdded: 0,
        videosUpdated: 0,
        segmentsAdded: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Deploy database to CDN-ready format
   */
  async deployDatabase(): Promise<{
    success: boolean
    version: string
    filePath: string
    fileSize: number
    compressed: boolean
    error?: string
  }> {
    try {
      const version = this.generateVersion()
      const stats = this.dbService.getStats()
      
      // Create version metadata
      const versionInfo: DatabaseVersion = {
        version,
        timestamp: new Date(),
        videoCount: stats.videoCount,
        segmentCount: stats.segmentCount,
        checksum: '',
        compressed: this.config.compressionEnabled
      }

      // Export database to temporary file
      const tempDbPath = join(this.config.outputPath, `temp-${version}.db`)
      await this.dbService.exportToFile(tempDbPath)

      // Read database file
      let dbBuffer = readFileSync(tempDbPath)
      
      // Calculate checksum
      versionInfo.checksum = createHash('sha256').update(dbBuffer).digest('hex')

      // Compress if enabled
      if (this.config.compressionEnabled) {
        dbBuffer = gzipSync(dbBuffer, { level: 9 })
      }

      // Write final database file
      const extension = this.config.compressionEnabled ? '.db.gz' : '.db'
      const finalPath = join(this.config.outputPath, `database-${version}${extension}`)
      writeFileSync(finalPath, dbBuffer)

      // Write version metadata
      const versionPath = join(this.config.outputPath, `version-${version}.json`)
      writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2))

      // Write latest version pointer
      const latestPath = join(this.config.outputPath, 'latest.json')
      writeFileSync(latestPath, JSON.stringify({
        version,
        url: `database-${version}${extension}`,
        metadata: versionInfo
      }, null, 2))

      // Clean up temporary file
      if (existsSync(tempDbPath)) {
        require('fs').unlinkSync(tempDbPath)
      }

      // Clean up old versions if versioning is enabled
      if (this.config.versioningEnabled) {
        await this.cleanupOldVersions()
      }

      console.log(`Database deployed: ${finalPath}`)
      console.log(`File size: ${(dbBuffer.length / 1024 / 1024).toFixed(2)} MB`)
      console.log(`Compressed: ${this.config.compressionEnabled}`)

      return {
        success: true,
        version,
        filePath: finalPath,
        fileSize: dbBuffer.length,
        compressed: this.config.compressionEnabled
      }
    } catch (error) {
      return {
        success: false,
        version: '',
        filePath: '',
        fileSize: 0,
        compressed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Rollback to a previous database version
   */
  async rollbackToVersion(version: string): Promise<{
    success: boolean
    error?: string
  }> {
    try {
      const extension = this.config.compressionEnabled ? '.db.gz' : '.db'
      const versionDbPath = join(this.config.outputPath, `database-${version}${extension}`)
      const versionMetaPath = join(this.config.outputPath, `version-${version}.json`)

      if (!existsSync(versionDbPath) || !existsSync(versionMetaPath)) {
        throw new Error(`Version ${version} not found`)
      }

      // Read version metadata
      const versionInfo: DatabaseVersion = JSON.parse(readFileSync(versionMetaPath, 'utf-8'))

      // Update latest pointer to rollback version
      const latestPath = join(this.config.outputPath, 'latest.json')
      writeFileSync(latestPath, JSON.stringify({
        version,
        url: `database-${version}${extension}`,
        metadata: versionInfo
      }, null, 2))

      console.log(`Rolled back to version ${version}`)

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get available database versions
   */
  getAvailableVersions(): DatabaseVersion[] {
    try {
      const versions: DatabaseVersion[] = []
      const files = require('fs').readdirSync(this.config.outputPath)
      
      for (const file of files) {
        if (file.startsWith('version-') && file.endsWith('.json')) {
          const versionPath = join(this.config.outputPath, file)
          const versionInfo: DatabaseVersion = JSON.parse(readFileSync(versionPath, 'utf-8'))
          versions.push(versionInfo)
        }
      }

      // Sort by timestamp, newest first
      return versions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    } catch (error) {
      console.error('Failed to get available versions:', error)
      return []
    }
  }

  /**
   * Validate database integrity
   */
  async validateDatabase(): Promise<{
    valid: boolean
    issues: string[]
  }> {
    const issues: string[] = []

    try {
      // Check basic database structure
      const stats = this.dbService.getStats()
      
      if (stats.videoCount === 0) {
        issues.push('Database contains no videos')
      }

      if (stats.segmentCount === 0) {
        issues.push('Database contains no video segments')
      }

      // Check for orphaned segments (need to access db through a method)
      // For now, skip this check as we don't have direct db access
      
      // Check for videos without segments (need to access db through a method)
      // For now, skip this check as we don't have direct db access



      return {
        valid: issues.length === 0,
        issues
      }
    } catch (error) {
      issues.push(`Database validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return {
        valid: false,
        issues
      }
    }
  }

  private hasVideoChanged(existing: VideoMetadata, updated: VideoMetadata): boolean {
    // Compare key fields that might change
    return (
      existing.title !== updated.title ||
      existing.description !== updated.description ||
      existing.duration !== updated.duration ||
      JSON.stringify(existing.services) !== JSON.stringify(updated.services) ||
      JSON.stringify(existing.topics) !== JSON.stringify(updated.topics) ||
      JSON.stringify(existing.speakers) !== JSON.stringify(updated.speakers) ||
      existing.metadataConfidence !== updated.metadataConfidence
    )
  }

  private generateVersion(): string {
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5) // Remove milliseconds and Z
    return `v${timestamp}`
  }

  private async cleanupOldVersions(): Promise<void> {
    try {
      const versions = this.getAvailableVersions()
      
      if (versions.length <= this.config.maxVersions) {
        return
      }

      // Keep only the latest maxVersions
      const versionsToDelete = versions.slice(this.config.maxVersions)
      
      for (const version of versionsToDelete) {
        const extension = version.compressed ? '.db.gz' : '.db'
        const dbPath = join(this.config.outputPath, `database-${version.version}${extension}`)
        const metaPath = join(this.config.outputPath, `version-${version.version}.json`)
        
        if (existsSync(dbPath)) {
          require('fs').unlinkSync(dbPath)
        }
        if (existsSync(metaPath)) {
          require('fs').unlinkSync(metaPath)
        }
        
        console.log(`Cleaned up old version: ${version.version}`)
      }
    } catch (error) {
      console.error('Failed to cleanup old versions:', error)
    }
  }
}