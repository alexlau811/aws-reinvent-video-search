/**
 * Database service implementation for SQLite operations
 * Handles video metadata and segment storage with full-text search
 */

import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { 
  VideoMetadata, 
  VideoSegment, 
  DatabaseService as IDatabaseService
} from '@aws-reinvent-search/shared'
import { DatabaseError } from '@aws-reinvent-search/shared'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class DatabaseService implements IDatabaseService {
  private db: Database.Database
  private insertVideoStmt: Database.Statement
  private insertSegmentStmt: Database.Statement
  private updateVideoStmt: Database.Statement
  private getVideoStmt: Database.Statement
  private getVideosByIdsStmt: Database.Statement
  private deleteVideoSegmentsStmt: Database.Statement

  constructor(dbPath: string = ':memory:') {
    try {
      this.db = new Database(dbPath)
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('synchronous = NORMAL')
      this.db.pragma('cache_size = 1000')
      this.db.pragma('temp_store = memory')
      
      this.initializeSchema()
      this.prepareStatements()
    } catch (error) {
      throw new DatabaseError('Failed to initialize database', 'initialization', error as Error)
    }
  }

  private initializeSchema(): void {
    try {
      const schemaPath = join(__dirname, 'schema.sql')
      const schema = readFileSync(schemaPath, 'utf-8')
      this.db.exec(schema)
    } catch (error) {
      throw new DatabaseError('Failed to initialize database schema', 'schema', error as Error)
    }
  }

  private prepareStatements(): void {
    try {
      // Video operations
      this.insertVideoStmt = this.db.prepare(`
        INSERT OR REPLACE INTO videos (
          id, title, description, channel_id, channel_title, published_at, duration,
          thumbnail_url, youtube_url, level, services, topics, industry, session_type,
          speakers, metadata_source, metadata_confidence, extracted_keywords, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `)

      this.updateVideoStmt = this.db.prepare(`
        UPDATE videos SET
          title = ?, description = ?, channel_id = ?, channel_title = ?, published_at = ?,
          duration = ?, thumbnail_url = ?, youtube_url = ?, level = ?, services = ?,
          topics = ?, industry = ?, session_type = ?, speakers = ?, metadata_source = ?,
          metadata_confidence = ?, extracted_keywords = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)

      this.getVideoStmt = this.db.prepare('SELECT * FROM videos WHERE id = ?')
      
      this.getVideosByIdsStmt = this.db.prepare(`
        SELECT * FROM videos WHERE id IN (${Array(100).fill('?').join(',')})
      `)

      // Segment operations
      this.insertSegmentStmt = this.db.prepare(`
        INSERT OR REPLACE INTO video_segments (
          id, video_id, start_time, end_time, text, embedding, confidence, speaker
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      this.deleteVideoSegmentsStmt = this.db.prepare('DELETE FROM video_segments WHERE video_id = ?')
    } catch (error) {
      throw new DatabaseError('Failed to prepare SQL statements', 'prepare', error as Error)
    }
  }

  async updateVideoMetadata(videos: VideoMetadata[]): Promise<void> {
    if (!videos.length) return

    const transaction = this.db.transaction((videosToUpdate: VideoMetadata[]) => {
      for (const video of videosToUpdate) {
        try {
          this.insertVideoStmt.run(
            video.id,
            video.title,
            video.description,
            video.channelId,
            video.channelTitle,
            video.publishedAt.toISOString(),
            video.duration,
            video.thumbnailUrl,
            video.youtubeUrl,
            video.level,
            JSON.stringify(video.services),
            JSON.stringify(video.topics),
            JSON.stringify(video.industry),
            video.sessionType,
            JSON.stringify(video.speakers),
            video.metadataSource,
            video.metadataConfidence,
            JSON.stringify(video.extractedKeywords)
          )
        } catch (error) {
          throw new DatabaseError(
            `Failed to insert/update video ${video.id}`, 
            'video_insert', 
            error as Error
          )
        }
      }
    })

    try {
      transaction(videos)
    } catch (error) {
      throw new DatabaseError('Failed to update video metadata', 'transaction', error as Error)
    }
  }

  async insertVideoSegments(segments: VideoSegment[]): Promise<void> {
    if (!segments.length) return

    const transaction = this.db.transaction((segmentsToInsert: VideoSegment[]) => {
      for (const segment of segmentsToInsert) {
        try {
          // Serialize embedding as binary data
          const embeddingBuffer = Buffer.from(new Float32Array(segment.embedding).buffer)
          
          this.insertSegmentStmt.run(
            segment.id,
            segment.videoId,
            segment.startTime,
            segment.endTime,
            segment.text,
            embeddingBuffer,
            segment.confidence || null,
            segment.speaker || null
          )
        } catch (error) {
          throw new DatabaseError(
            `Failed to insert segment ${segment.id}`, 
            'segment_insert', 
            error as Error
          )
        }
      }
    })

    try {
      transaction(segments)
    } catch (error) {
      throw new DatabaseError('Failed to insert video segments', 'transaction', error as Error)
    }
  }

  /**
   * Get existing video metadata by IDs for comparison
   */
  getExistingVideos(videoIds: string[]): VideoMetadata[] {
    if (!videoIds.length) return []

    try {
      // Handle large batches by chunking
      const results: any[] = []
      const chunkSize = 100
      
      for (let i = 0; i < videoIds.length; i += chunkSize) {
        const chunk = videoIds.slice(i, i + chunkSize)
        const placeholders = chunk.map(() => '?').join(',')
        const stmt = this.db.prepare(`SELECT * FROM videos WHERE id IN (${placeholders})`)
        const chunkResults = stmt.all(...chunk)
        results.push(...chunkResults)
      }

      return results.map(this.mapRowToVideoMetadata)
    } catch (error) {
      throw new DatabaseError('Failed to get existing videos', 'select', error as Error)
    }
  }

  /**
   * Get video by ID
   */
  getVideo(videoId: string): VideoMetadata | null {
    try {
      const row = this.getVideoStmt.get(videoId)
      return row ? this.mapRowToVideoMetadata(row) : null
    } catch (error) {
      throw new DatabaseError(`Failed to get video ${videoId}`, 'select', error as Error)
    }
  }

  /**
   * Delete all segments for a video (used when updating video segments)
   */
  deleteVideoSegments(videoId: string): void {
    try {
      this.deleteVideoSegmentsStmt.run(videoId)
    } catch (error) {
      throw new DatabaseError(
        `Failed to delete segments for video ${videoId}`, 
        'delete', 
        error as Error
      )
    }
  }

  /**
   * Get video segments for a video
   */
  getVideoSegments(videoId: string): VideoSegment[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM video_segments WHERE video_id = ? ORDER BY start_time')
      const rows = stmt.all(videoId)
      
      return rows.map((row: any) => ({
        id: row.id,
        videoId: row.video_id,
        startTime: row.start_time,
        endTime: row.end_time,
        text: row.text,
        embedding: Array.from(new Float32Array(row.embedding.buffer)),
        confidence: row.confidence,
        speaker: row.speaker
      }))
    } catch (error) {
      throw new DatabaseError(
        `Failed to get segments for video ${videoId}`, 
        'select', 
        error as Error
      )
    }
  }

  private mapRowToVideoMetadata(row: any): VideoMetadata {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      channelId: row.channel_id,
      channelTitle: row.channel_title,
      publishedAt: new Date(row.published_at),
      duration: row.duration,
      thumbnailUrl: row.thumbnail_url,
      youtubeUrl: row.youtube_url,
      level: row.level,
      services: JSON.parse(row.services || '[]'),
      topics: JSON.parse(row.topics || '[]'),
      industry: JSON.parse(row.industry || '[]'),
      sessionType: row.session_type,
      speakers: JSON.parse(row.speakers || '[]'),
      metadataSource: row.metadata_source,
      metadataConfidence: row.metadata_confidence,
      extractedKeywords: JSON.parse(row.extracted_keywords || '[]')
    }
  }

  async optimizeDatabase(): Promise<void> {
    try {
      // Only rebuild FTS indexes if tables have data
      const videoCount = this.db.prepare('SELECT COUNT(*) as count FROM videos').get() as { count: number }
      const segmentCount = this.db.prepare('SELECT COUNT(*) as count FROM video_segments').get() as { count: number }
      
      if (videoCount.count > 0) {
        try {
          this.db.exec('INSERT INTO videos_fts(videos_fts) VALUES("rebuild")')
        } catch (error) {
          // FTS rebuild might fail, continue with other optimizations
          console.warn('Failed to rebuild videos FTS index:', error)
        }
      }
      
      if (segmentCount.count > 0) {
        try {
          this.db.exec('INSERT INTO segments_fts(segments_fts) VALUES("rebuild")')
        } catch (error) {
          // FTS rebuild might fail, continue with other optimizations
          console.warn('Failed to rebuild segments FTS index:', error)
        }
      }
      
      // Analyze tables for query optimization
      this.db.exec('ANALYZE')
      
      // Vacuum to reclaim space and optimize file structure
      this.db.exec('VACUUM')
    } catch (error) {
      throw new DatabaseError('Failed to optimize database', 'optimize', error as Error)
    }
  }

  async exportToFile(path: string): Promise<void> {
    try {
      // For in-memory databases, we need to create a file-based copy
      if (this.db.name === ':memory:') {
        // Create a temporary file-based database and copy data
        const tempDb = new Database(path)
        
        // Copy schema
        const schemaPath = join(__dirname, 'schema.sql')
        const schema = readFileSync(schemaPath, 'utf-8')
        tempDb.exec(schema)
        
        // Copy data
        const videos = this.db.prepare('SELECT * FROM videos').all()
        const segments = this.db.prepare('SELECT * FROM video_segments').all()
        
        const insertVideo = tempDb.prepare(`
          INSERT INTO videos (
            id, title, description, channel_id, channel_title, published_at, duration,
            thumbnail_url, youtube_url, level, services, topics, industry, session_type,
            speakers, metadata_source, metadata_confidence, extracted_keywords, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        
        const insertSegment = tempDb.prepare(`
          INSERT INTO video_segments (
            id, video_id, start_time, end_time, text, embedding, confidence, speaker
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        
        for (const video of videos) {
          insertVideo.run(
            video.id, video.title, video.description, video.channel_id, video.channel_title,
            video.published_at, video.duration, video.thumbnail_url, video.youtube_url,
            video.level, video.services, video.topics, video.industry, video.session_type,
            video.speakers, video.metadata_source, video.metadata_confidence,
            video.extracted_keywords, video.created_at, video.updated_at
          )
        }
        
        for (const segment of segments) {
          insertSegment.run(
            segment.id, segment.video_id, segment.start_time, segment.end_time,
            segment.text, segment.embedding, segment.confidence, segment.speaker
          )
        }
        
        tempDb.close()
      } else {
        // For file-based databases, use backup
        const backup = this.db.backup(path)
        
        return new Promise((resolve, reject) => {
          backup.step(-1, (err) => {
            if (err) {
              reject(new DatabaseError(`Failed to export database to ${path}`, 'export', err))
            } else {
              backup.finish()
              resolve()
            }
          })
        })
      }
    } catch (error) {
      throw new DatabaseError(`Failed to export database to ${path}`, 'export', error as Error)
    }
  }

  /**
   * Get database statistics for monitoring
   */
  getStats(): {
    videoCount: number
    segmentCount: number
    dbSize: number
    lastUpdate: string | null
  } {
    try {
      const videoCount = this.db.prepare('SELECT COUNT(*) as count FROM videos').get() as { count: number }
      const segmentCount = this.db.prepare('SELECT COUNT(*) as count FROM video_segments').get() as { count: number }
      const lastUpdate = this.db.prepare('SELECT MAX(updated_at) as last_update FROM videos').get() as { last_update: string | null }
      
      // Get database file size (0 for in-memory databases)
      const dbSize = this.db.name === ':memory:' ? 0 : this.db.prepare('PRAGMA page_count').get() as number
      
      return {
        videoCount: videoCount.count,
        segmentCount: segmentCount.count,
        dbSize: dbSize,
        lastUpdate: lastUpdate.last_update
      }
    } catch (error) {
      throw new DatabaseError('Failed to get database statistics', 'stats', error as Error)
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    try {
      this.db.close()
    } catch (error) {
      throw new DatabaseError('Failed to close database', 'close', error as Error)
    }
  }
}