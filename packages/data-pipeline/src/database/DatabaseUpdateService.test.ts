/**
 * Tests for DatabaseUpdateService
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { DatabaseService } from './DatabaseService.js'
import { DatabaseUpdateService } from './DatabaseUpdateService.js'
import type { VideoMetadata, VideoSegment } from '@aws-reinvent-search/shared'

describe('DatabaseUpdateService', () => {
  let dbService: DatabaseService
  let updateService: DatabaseUpdateService
  const testOutputPath = './test-output'

  beforeEach(() => {
    // Clean up and create test directory
    if (existsSync(testOutputPath)) {
      rmSync(testOutputPath, { recursive: true })
    }
    mkdirSync(testOutputPath, { recursive: true })

    // Create services
    dbService = new DatabaseService(':memory:')
    updateService = new DatabaseUpdateService(dbService, {
      outputPath: testOutputPath,
      compressionEnabled: false, // Disable compression for easier testing
      versioningEnabled: true,
      maxVersions: 3
    })
  })

  afterEach(() => {
    if (existsSync(testOutputPath)) {
      rmSync(testOutputPath, { recursive: true })
    }
    // Close database after cleanup to avoid issues with backup
    try {
      dbService.close()
    } catch (error) {
      // Ignore close errors in tests
    }
  })

  const createTestVideo = (id: string = 'test-video-1'): VideoMetadata => ({
    id,
    title: 'AWS re:Invent 2025 - Test Session',
    description: 'A test session about AWS services',
    channelId: 'UC_test',
    channelTitle: 'AWS Events',
    publishedAt: new Date('2025-01-01'),
    duration: 3600,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    youtubeUrl: 'https://youtube.com/watch?v=test',
    level: 'Intermediate',
    services: ['EC2', 'S3'],
    topics: ['compute', 'storage'],
    industry: ['technology'],
    sessionType: 'Breakout',
    speakers: ['John Doe'],
    metadataSource: 'transcript',
    metadataConfidence: 0.85,
    extractedKeywords: ['aws', 'cloud', 'compute']
  })

  const createTestSegment = (videoId: string, id: string = 'segment-1'): VideoSegment => ({
    id,
    videoId,
    startTime: 0,
    endTime: 30,
    text: 'Welcome to this AWS session about cloud computing',
    embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
    confidence: 0.9,
    speaker: 'John Doe'
  })

  describe('Database Updates', () => {
    it('should update database with new videos and segments', async () => {
      const video = createTestVideo()
      const segment = createTestSegment(video.id)

      const result = await updateService.updateDatabase([video], [segment])

      expect(result.success).toBe(true)
      expect(result.videosAdded).toBe(1)
      expect(result.videosUpdated).toBe(0)
      expect(result.segmentsAdded).toBe(1)
      expect(result.version).toBeTruthy()
    })

    it('should detect updated videos', async () => {
      const video = createTestVideo()
      const segment = createTestSegment(video.id)

      // First update
      await updateService.updateDatabase([video], [segment])

      // Update video with changes
      const updatedVideo = { ...video, title: 'Updated Title', metadataConfidence: 0.95 }
      const result = await updateService.updateDatabase([updatedVideo], [segment])

      expect(result.success).toBe(true)
      expect(result.videosAdded).toBe(0)
      expect(result.videosUpdated).toBe(1)
    })

    it('should handle multiple videos and segments', async () => {
      const videos = [
        createTestVideo('video-1'),
        createTestVideo('video-2')
      ]
      const segments = [
        createTestSegment('video-1', 'segment-1'),
        createTestSegment('video-1', 'segment-2'),
        createTestSegment('video-2', 'segment-3')
      ]

      const result = await updateService.updateDatabase(videos, segments)

      expect(result.success).toBe(true)
      expect(result.videosAdded).toBe(2)
      expect(result.segmentsAdded).toBe(3)
    })
  })

  describe('Database Deployment', () => {
    it('should deploy database to file', async () => {
      const video = createTestVideo()
      const segment = createTestSegment(video.id)

      await updateService.updateDatabase([video], [segment])
      const result = await updateService.deployDatabase()

      expect(result.success).toBe(true)
      expect(result.version).toBeTruthy()
      expect(result.filePath).toBeTruthy()
      expect(result.fileSize).toBeGreaterThan(0)
      expect(result.compressed).toBe(false)

      // Check that files were created
      expect(existsSync(result.filePath)).toBe(true)
      expect(existsSync(join(testOutputPath, 'latest.json'))).toBe(true)
    })

    it('should create version metadata', async () => {
      const video = createTestVideo()
      const segment = createTestSegment(video.id)

      await updateService.updateDatabase([video], [segment])
      const result = await updateService.deployDatabase()

      const versionFile = join(testOutputPath, `version-${result.version}.json`)
      expect(existsSync(versionFile)).toBe(true)

      const versionData = JSON.parse(readFileSync(versionFile, 'utf-8'))
      expect(versionData.version).toBe(result.version)
      expect(versionData.videoCount).toBe(1)
      expect(versionData.segmentCount).toBe(1)
      expect(versionData.checksum).toBeTruthy()
    })

    it('should update latest.json pointer', async () => {
      const video = createTestVideo()
      const segment = createTestSegment(video.id)

      await updateService.updateDatabase([video], [segment])
      const result = await updateService.deployDatabase()

      const latestFile = join(testOutputPath, 'latest.json')
      const latestData = JSON.parse(readFileSync(latestFile, 'utf-8'))

      expect(latestData.version).toBe(result.version)
      expect(latestData.url).toBe(`database-${result.version}.db`)
      expect(latestData.metadata).toBeTruthy()
    })
  })

  describe('Version Management', () => {
    it('should get available versions', async () => {
      const video = createTestVideo()
      const segment = createTestSegment(video.id)

      await updateService.updateDatabase([video], [segment])
      await updateService.deployDatabase()

      const versions = updateService.getAvailableVersions()
      expect(versions).toHaveLength(1)
      expect(versions[0].videoCount).toBe(1)
      expect(versions[0].segmentCount).toBe(1)
    })

    it('should rollback to previous version', async () => {
      const video = createTestVideo()
      const segment = createTestSegment(video.id)

      await updateService.updateDatabase([video], [segment])
      const firstDeploy = await updateService.deployDatabase()

      // Deploy second version
      const updatedVideo = { ...video, title: 'Updated Title' }
      await updateService.updateDatabase([updatedVideo], [segment])
      await updateService.deployDatabase()

      // Rollback to first version
      const rollbackResult = await updateService.rollbackToVersion(firstDeploy.version)
      expect(rollbackResult.success).toBe(true)

      // Check that latest.json points to first version
      const latestData = JSON.parse(readFileSync(join(testOutputPath, 'latest.json'), 'utf-8'))
      expect(latestData.version).toBe(firstDeploy.version)
    })
  })

  describe('Database Validation', () => {
    it('should validate empty database', async () => {
      const validation = await updateService.validateDatabase()
      expect(validation.valid).toBe(false)
      expect(validation.issues).toContain('Database contains no videos')
      expect(validation.issues).toContain('Database contains no video segments')
    })

    it('should validate populated database', async () => {
      const video = createTestVideo()
      const segment = createTestSegment(video.id)

      await updateService.updateDatabase([video], [segment])
      const validation = await updateService.validateDatabase()

      expect(validation.valid).toBe(true)
      expect(validation.issues).toHaveLength(0)
    })

    it('should validate database with videos but no segments', async () => {
      const video = createTestVideo()
      await updateService.updateDatabase([video], []) // No segments

      const validation = await updateService.validateDatabase()
      expect(validation.valid).toBe(false)
      expect(validation.issues).toContain('Database contains no video segments')
    })
  })

  describe('Error Handling', () => {
    it('should handle update errors gracefully', async () => {
      // Create invalid video data
      const invalidVideo = { ...createTestVideo(), publishedAt: null as any }
      
      const result = await updateService.updateDatabase([invalidVideo], [])
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('should handle rollback to non-existent version', async () => {
      const result = await updateService.rollbackToVersion('non-existent-version')
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })
})