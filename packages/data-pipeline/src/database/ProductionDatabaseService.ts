/**
 * Production-optimized database service with enhanced performance and reliability
 */

import { DatabaseService } from './DatabaseService.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import type { VideoMetadata, VideoSegment } from '@aws-reinvent-search/shared'

interface DatabaseMetrics {
  totalSize: number
  videoCount: number
  segmentCount: number
  avgSegmentsPerVideo: number
  compressionRatio?: number
  lastOptimized: Date
  version: string
}

export class ProductionDatabaseService extends DatabaseService {
  private metricsPath: string
  private version: string

  constructor(dbPath: string, version: string = '1.0.0') {
    super(dbPath)
    this.version = version
    this.metricsPath = dbPath.replace('.db', '.metrics.json')
    
    // Apply production-specific optimizations
    this.applyProductionSettings()
  }

  private applyProductionSettings(): void {
    // Production SQLite settings for better performance
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = 20000') // 20MB cache
    this.db.pragma('temp_store = memory')
    this.db.pragma('mmap_size = 536870912') // 512MB memory mapping
    this.db.pragma('page_size = 4096') // Optimal page size
    this.db.pragma('auto_vacuum = INCREMENTAL')
    
    // Enable query planner optimizations
    this.db.pragma('optimize')
  }

  /**
   * Create production database with comprehensive validation
   */
  async createProductionDatabase(
    videos: VideoMetadata[], 
    segments: VideoSegment[],
    options: {
      validateData?: boolean
      createBackup?: boolean
      enableCompression?: boolean
    } = {}
  ): Promise<DatabaseMetrics> {
    const { validateData = true, createBackup = true, enableCompression = true } = options
    
    console.log('🏗️ Creating production database...')
    
    // Validate input data if requested
    if (validateData) {
      console.log('🔍 Validating input data...')
      this.validateInputData(videos, segments)
    }
    
    // Create backup if database exists
    if (createBackup && existsSync(this.db.name)) {
      const backupPath = this.db.name.replace('.db', `.backup.${Date.now()}.db`)
      console.log(`📦 Creating backup: ${backupPath}`)
      await this.exportToFile(backupPath)
    }
    
    // Insert data in optimized batches
    console.log('📊 Inserting video metadata...')
    await this.batchInsertVideos(videos)
    
    console.log('📊 Inserting video segments...')
    await this.batchInsertSegments(segments)
    
    // Apply production optimizations
    console.log('⚡ Applying production optimizations...')
    await this.applyProductionOptimizations(enableCompression)
    
    // Generate and save metrics
    const metrics = await this.generateMetrics()
    this.saveMetrics(metrics)
    
    console.log('✅ Production database created successfully!')
    return metrics
  }

  private validateInputData(videos: VideoMetadata[], segments: VideoSegment[]): void {
    // Validate videos
    const videoIds = new Set(videos.map(v => v.id))
    if (videoIds.size !== videos.length) {
      throw new Error('Duplicate video IDs found')
    }
    
    // Validate segments reference existing videos
    const segmentVideoIds = new Set(segments.map(s => s.videoId))
    const orphanedSegments = [...segmentVideoIds].filter(id => !videoIds.has(id))
    if (orphanedSegments.length > 0) {
      throw new Error(`Segments reference non-existent videos: ${orphanedSegments.join(', ')}`)
    }
    
    // Validate required fields
    for (const video of videos) {
      if (!video.id || !video.title || !video.youtubeUrl) {
        throw new Error(`Invalid video data: ${JSON.stringify(video)}`)
      }
    }
    
    for (const segment of segments) {
      if (!segment.id || !segment.videoId || !segment.text || !segment.embedding) {
        throw new Error(`Invalid segment data: ${JSON.stringify(segment)}`)
      }
      
      if (segment.embedding.length !== 384) {
        throw new Error(`Invalid embedding dimension for segment ${segment.id}: expected 384, got ${segment.embedding.length}`)
      }
    }
    
    console.log(`✅ Data validation passed: ${videos.length} videos, ${segments.length} segments`)
  }

  private async batchInsertVideos(videos: VideoMetadata[]): Promise<void> {
    const batchSize = 100
    let inserted = 0
    
    for (let i = 0; i < videos.length; i += batchSize) {
      const batch = videos.slice(i, i + batchSize)
      await this.updateVideoMetadata(batch)
      inserted += batch.length
      
      if (inserted % 500 === 0) {
        console.log(`  📊 Inserted ${inserted}/${videos.length} videos`)
      }
    }
  }

  private async batchInsertSegments(segments: VideoSegment[]): Promise<void> {
    const batchSize = 500
    let inserted = 0
    
    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize)
      await this.insertVideoSegments(batch)
      inserted += batch.length
      
      if (inserted % 2000 === 0) {
        console.log(`  📊 Inserted ${inserted}/${segments.length} segments`)
      }
    }
  }

  private async applyProductionOptimizations(enableCompression: boolean): Promise<void> {
    // Rebuild FTS indexes for optimal performance
    console.log('  🔍 Rebuilding search indexes...')
    try {
      this.db.exec("INSERT INTO videos_fts(videos_fts) VALUES('rebuild')")
      this.db.exec("INSERT INTO segments_fts(segments_fts) VALUES('rebuild')")
    } catch (error) {
      console.warn('  ⚠️ FTS rebuild warning:', error)
    }
    
    // Update table statistics
    console.log('  📈 Updating table statistics...')
    this.db.exec('ANALYZE')
    
    // Optimize query planner
    this.db.exec('PRAGMA optimize')
    
    if (enableCompression) {
      console.log('  🗜️ Applying compression...')
      this.db.exec('VACUUM')
      
      // Incremental vacuum for future maintenance
      this.db.exec('PRAGMA incremental_vacuum')
    }
  }

  private async generateMetrics(): Promise<DatabaseMetrics> {
    const stats = this.getStats()
    
    // Calculate additional metrics
    const avgSegmentsPerVideo = stats.videoCount > 0 ? 
      Math.round(stats.segmentCount / stats.videoCount * 100) / 100 : 0
    
    // Get file size
    const fileSizeQuery = this.db.prepare('PRAGMA page_count').get() as { page_count?: number }
    const pageSize = this.db.prepare('PRAGMA page_size').get() as { page_size?: number }
    const totalSize = (fileSizeQuery.page_count || 0) * (pageSize.page_size || 4096)
    
    return {
      totalSize,
      videoCount: stats.videoCount,
      segmentCount: stats.segmentCount,
      avgSegmentsPerVideo,
      lastOptimized: new Date(),
      version: this.version
    }
  }

  private saveMetrics(metrics: DatabaseMetrics): void {
    writeFileSync(this.metricsPath, JSON.stringify(metrics, null, 2))
    console.log(`📊 Metrics saved to: ${this.metricsPath}`)
  }

  /**
   * Load saved metrics
   */
  loadMetrics(): DatabaseMetrics | null {
    try {
      if (existsSync(this.metricsPath)) {
        const data = readFileSync(this.metricsPath, 'utf-8')
        return JSON.parse(data)
      }
    } catch (error) {
      console.warn('Failed to load metrics:', error)
    }
    return null
  }

  /**
   * Verify database integrity and performance
   */
  async verifyDatabase(): Promise<{
    integrityOk: boolean
    performanceMetrics: {
      videoQueryTime: number
      segmentQueryTime: number
      ftsQueryTime: number
    }
    issues: string[]
  }> {
    const issues: string[] = []
    
    // Check integrity
    const integrityResult = this.db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
    const integrityOk = integrityResult.integrity_check === 'ok'
    
    if (!integrityOk) {
      issues.push(`Database integrity check failed: ${integrityResult.integrity_check}`)
    }
    
    // Performance benchmarks
    const performanceMetrics = {
      videoQueryTime: 0,
      segmentQueryTime: 0,
      ftsQueryTime: 0
    }
    
    try {
      // Test video query performance
      const videoStart = Date.now()
      this.db.prepare('SELECT COUNT(*) FROM videos').get()
      performanceMetrics.videoQueryTime = Date.now() - videoStart
      
      // Test segment query performance
      const segmentStart = Date.now()
      this.db.prepare('SELECT COUNT(*) FROM video_segments').get()
      performanceMetrics.segmentQueryTime = Date.now() - segmentStart
      
      // Test FTS query performance
      const ftsStart = Date.now()
      this.db.prepare("SELECT COUNT(*) FROM videos_fts WHERE videos_fts MATCH 'aws'").get()
      performanceMetrics.ftsQueryTime = Date.now() - ftsStart
      
    } catch (error) {
      issues.push(`Performance test failed: ${error}`)
    }
    
    return {
      integrityOk,
      performanceMetrics,
      issues
    }
  }

  /**
   * Create a compressed version for distribution
   */
  async createDistributionVersion(outputPath: string): Promise<void> {
    console.log('📦 Creating distribution version...')
    
    // Export to new file
    await this.exportToFile(outputPath)
    
    // Open the new database and apply distribution optimizations
    const distDb = new ProductionDatabaseService(outputPath, this.version)
    
    try {
      // Apply maximum compression
      distDb.db.exec('VACUUM')
      distDb.db.exec('PRAGMA incremental_vacuum')
      
      // Optimize for read-only access
      distDb.db.pragma('journal_mode = DELETE') // Smaller file size
      distDb.db.pragma('synchronous = OFF') // Read-only optimization
      
      console.log('✅ Distribution version created')
    } finally {
      distDb.close()
    }
  }
}