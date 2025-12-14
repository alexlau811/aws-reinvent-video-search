/**
 * Tests for DatabaseService
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from './DatabaseService.js'
import type { VideoMetadata, VideoSegment } from '@aws-reinvent-search/shared'

describe('DatabaseService', () => {
  let db: DatabaseService

  beforeEach(() => {
    // Use in-memory database for tests
    db = new DatabaseService(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  const createTestVideo = (): VideoMetadata => ({
    id: 'test-video-1',
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

  const createTestSegment = (videoId: string): VideoSegment => ({
    id: 'segment-1',
    videoId,
    startTime: 0,
    endTime: 30,
    text: 'Welcome to this AWS session about cloud computing',
    embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
    confidence: 0.9,
    speaker: 'John Doe'
  })

  describe('Video Operations', () => {
    it('should insert and retrieve video metadata', async () => {
      const video = createTestVideo()
      
      await db.updateVideoMetadata([video])
      
      const retrieved = db.getVideo(video.id)
      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe(video.id)
      expect(retrieved?.title).toBe(video.title)
      expect(retrieved?.services).toEqual(video.services)
      expect(retrieved?.publishedAt).toEqual(video.publishedAt)
    })

    it('should update existing video metadata', async () => {
      const video = createTestVideo()
      await db.updateVideoMetadata([video])
      
      const updatedVideo = { ...video, title: 'Updated Title' }
      await db.updateVideoMetadata([updatedVideo])
      
      const retrieved = db.getVideo(video.id)
      expect(retrieved?.title).toBe('Updated Title')
    })

    it('should handle multiple videos in batch', async () => {
      const videos = [
        createTestVideo(),
        { ...createTestVideo(), id: 'test-video-2', title: 'Second Video' }
      ]
      
      await db.updateVideoMetadata(videos)
      
      const existing = db.getExistingVideos(['test-video-1', 'test-video-2'])
      expect(existing).toHaveLength(2)
    })
  })

  describe('Segment Operations', () => {
    it('should insert and retrieve video segments', async () => {
      const video = createTestVideo()
      const segment = createTestSegment(video.id)
      
      await db.updateVideoMetadata([video])
      await db.insertVideoSegments([segment])
      
      const segments = db.getVideoSegments(video.id)
      expect(segments).toHaveLength(1)
      expect(segments[0].id).toBe(segment.id)
      expect(segments[0].text).toBe(segment.text)
      // Check embedding values with floating point tolerance
      expect(segments[0].embedding).toHaveLength(segment.embedding.length)
      segments[0].embedding.forEach((val, idx) => {
        expect(val).toBeCloseTo(segment.embedding[idx], 5)
      })
    })

    it('should delete video segments', async () => {
      const video = createTestVideo()
      const segment = createTestSegment(video.id)
      
      await db.updateVideoMetadata([video])
      await db.insertVideoSegments([segment])
      
      db.deleteVideoSegments(video.id)
      
      const segments = db.getVideoSegments(video.id)
      expect(segments).toHaveLength(0)
    })
  })

  describe('Database Operations', () => {
    it('should get database statistics', () => {
      const stats = db.getStats()
      expect(stats.videoCount).toBe(0)
      expect(stats.segmentCount).toBe(0)
      expect(stats.dbSize).toBe(0) // In-memory database
    })

    it('should optimize database without errors', async () => {
      await expect(db.optimizeDatabase()).resolves.not.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should handle empty arrays gracefully', async () => {
      await expect(db.updateVideoMetadata([])).resolves.not.toThrow()
      await expect(db.insertVideoSegments([])).resolves.not.toThrow()
    })

    it('should return null for non-existent video', () => {
      const video = db.getVideo('non-existent')
      expect(video).toBeNull()
    })

    it('should return empty array for non-existent video segments', () => {
      const segments = db.getVideoSegments('non-existent')
      expect(segments).toEqual([])
    })
  })
})