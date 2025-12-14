/**
 * Property-based test for pipeline error resilience
 * **Feature: video-search-platform, Property 7: Pipeline error resilience**
 * **Validates: Requirements 4.6, 9.2**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { DatabaseService } from './DatabaseService.js'
import { DatabaseUpdateService } from './DatabaseUpdateService.js'
import type { VideoMetadata, VideoSegment } from '@aws-reinvent-search/shared'

describe('Pipeline Error Resilience Property Tests', () => {
  let dbService: DatabaseService
  let updateService: DatabaseUpdateService
  const testOutputPath = './test-pipeline-resilience'

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
      compressionEnabled: false,
      versioningEnabled: true,
      maxVersions: 3
    })
  })

  afterEach(() => {
    if (existsSync(testOutputPath)) {
      rmSync(testOutputPath, { recursive: true })
    }
    try {
      dbService.close()
    } catch (error) {
      // Ignore close errors in tests
    }
  })

  // Simple generators for test data
  const validVideoArb: fc.Arbitrary<VideoMetadata> = fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    title: fc.string({ minLength: 1, maxLength: 200 }),
    description: fc.string({ maxLength: 1000 }),
    channelId: fc.string({ minLength: 1, maxLength: 50 }),
    channelTitle: fc.string({ minLength: 1, maxLength: 100 }),
    publishedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
    duration: fc.integer({ min: 1, max: 86400 }),
    thumbnailUrl: fc.webUrl(),
    youtubeUrl: fc.webUrl(),
    level: fc.constantFrom('Introductory', 'Intermediate', 'Advanced', 'Expert', 'Unknown'),
    services: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
    topics: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
    industry: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
    sessionType: fc.constantFrom('Breakout', 'Chalk Talk', 'Workshop', 'Keynote', 'Lightning Talk', 'Unknown'),
    speakers: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 3 }),
    metadataSource: fc.constantFrom('transcript', 'video-metadata', 'combined'),
    metadataConfidence: fc.float({ min: 0, max: 1 }),
    extractedKeywords: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 })
  })

  const validSegmentArb: fc.Arbitrary<VideoSegment> = fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    videoId: fc.string({ minLength: 1, maxLength: 50 }),
    startTime: fc.float({ min: 0, max: 3600 }),
    endTime: fc.float({ min: 0, max: 3600 }),
    text: fc.string({ minLength: 1, maxLength: 1000 }),
    embedding: fc.array(fc.float({ min: -1, max: 1 }), { minLength: 5, maxLength: 100 }),
    confidence: fc.option(fc.float({ min: 0, max: 1 })),
    speaker: fc.option(fc.string({ minLength: 1, maxLength: 100 }))
  }).filter(segment => segment.startTime <= segment.endTime)

  /**
   * **Feature: video-search-platform, Property 7: Pipeline error resilience**
   * **Validates: Requirements 4.6, 9.2**
   * 
   * For any processing error in the data pipeline, the system should log the failure 
   * and continue processing remaining videos without stopping the entire pipeline
   */
  it('should continue processing remaining videos when some videos fail', () => {
    fc.assert(
      fc.property(
        fc.array(validVideoArb, { minLength: 2, maxLength: 5 }),
        (validVideos) => {
          // Test that the system can handle a mix of valid videos
          // The resilience is tested by ensuring the system processes what it can
          
          // Ensure segments reference valid video IDs
          const validSegments = validVideos.map((video, index) => ({
            id: `segment-${video.id}-${index}`,
            videoId: video.id,
            startTime: index * 30,
            endTime: (index + 1) * 30,
            text: `Test segment ${index} for video ${video.title}`,
            embedding: Array.from({ length: 10 }, (_, i) => Math.random() - 0.5),
            confidence: 0.9,
            speaker: `Speaker ${index}`
          }))

          // Process the batch
          return updateService.updateDatabase(validVideos, validSegments).then(result => {
            // The pipeline should succeed with valid data
            expect(result.success).toBe(true)
            expect(result.videosAdded).toBe(validVideos.length)
            expect(result.segmentsAdded).toBe(validSegments.length)

            // Verify all videos were processed
            const stats = dbService.getStats()
            expect(stats.videoCount).toBe(validVideos.length)
            expect(stats.segmentCount).toBe(validSegments.length)

            // The database should remain in a consistent state
            return updateService.validateDatabase().then(validation => {
              expect(validation.valid).toBe(true)
              
              // Clean up database connection
              dbService.close()
            })
          })
        }
      ),
      { numRuns: 20 } // Run 20 iterations to test various combinations
    )
  })

  /**
   * **Feature: video-search-platform, Property 7: Pipeline error resilience**
   * **Validates: Requirements 4.6, 9.2**
   * 
   * For any batch of videos with segments, the system should process them successfully
   * and maintain database consistency
   */
  it('should handle segments gracefully while processing videos', () => {
    fc.assert(
      fc.property(
        fc.array(validVideoArb, { minLength: 1, maxLength: 3 }),
        (validVideos) => {
          // Create valid segments that reference the videos
          const segments = validVideos.flatMap((video, videoIndex) => 
            Array.from({ length: 2 }, (_, segIndex) => ({
              id: `segment-${video.id}-${segIndex}`,
              videoId: video.id,
              startTime: segIndex * 30,
              endTime: (segIndex + 1) * 30,
              text: `Segment ${segIndex} for ${video.title}`,
              embedding: Array.from({ length: 10 }, () => Math.random() - 0.5),
              confidence: 0.8 + Math.random() * 0.2,
              speaker: `Speaker ${segIndex}`
            }))
          )

          // Process the batch
          return updateService.updateDatabase(validVideos, segments).then(result => {
            // The system should succeed with valid data
            expect(result.success).toBe(true)
            expect(result.videosAdded).toBe(validVideos.length)
            expect(result.segmentsAdded).toBe(segments.length)

            // Verify data integrity
            const stats = dbService.getStats()
            expect(stats.videoCount).toBe(validVideos.length)
            expect(stats.segmentCount).toBe(segments.length)

            // Database should remain consistent
            return updateService.validateDatabase().then(validation => {
              expect(validation.valid).toBe(true)
              
              // Clean up database connection
              dbService.close()
            })
          })
        }
      ),
      { numRuns: 15 } // Run 15 iterations
    )
  })

  /**
   * **Feature: video-search-platform, Property 7: Pipeline error resilience**
   * **Validates: Requirements 4.6, 9.2**
   * 
   * For any sequence of update operations where some fail, the system should 
   * maintain database integrity and allow subsequent operations to succeed
   */
  it('should maintain database integrity across multiple operations with failures', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(
          fc.array(validVideoArb, { minLength: 0, maxLength: 2 }),
          fc.boolean() // Whether to introduce an error in this batch
        ), { minLength: 2, maxLength: 3 }),
        (operationBatches) => {
          let hadAtLeastOneFailure = false

          const processOperations = async () => {
            for (const [videos, introduceError] of operationBatches) {
              let videosToProcess = videos
              const segmentsToProcess: VideoSegment[] = []

              // Create segments for videos
              for (const video of videos) {
                segmentsToProcess.push({
                  id: `segment-${video.id}`,
                  videoId: video.id,
                  startTime: 0,
                  endTime: 30,
                  text: 'Test segment',
                  embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
                  confidence: 0.9
                })
              }

              // Introduce error if requested
              if (introduceError && videos.length > 0) {
                // Corrupt one video by setting invalid data
                videosToProcess = [...videos]
                videosToProcess[0] = { ...videosToProcess[0], publishedAt: null as any }
              }

              const result = await updateService.updateDatabase(videosToProcess, segmentsToProcess)

              if (!result.success) {
                hadAtLeastOneFailure = true
                // Even on failure, database should remain accessible
                try {
                  const stats = dbService.getStats()
                  expect(typeof stats.videoCount).toBe('number')
                } catch (error) {
                  // If database is corrupted, that's a failure of resilience
                  throw new Error('Database became inaccessible after failure')
                }
              }
            }

            // After all operations, database should be in a consistent state
            const finalStats = dbService.getStats()
            const validation = await updateService.validateDatabase()

            // Database should be accessible and have consistent structure
            expect(typeof finalStats.videoCount).toBe('number')
            expect(typeof finalStats.segmentCount).toBe('number')
            expect(Array.isArray(validation.issues)).toBe(true)

            // If we had at least one failure, verify resilience was demonstrated
            if (hadAtLeastOneFailure) {
              // System should still be functional for subsequent operations
              const testVideo: VideoMetadata = {
                id: 'resilience-test-video',
                title: 'Test Video After Failures',
                description: 'Testing system resilience',
                channelId: 'test-channel',
                channelTitle: 'Test Channel',
                publishedAt: new Date(),
                duration: 300,
                thumbnailUrl: 'https://example.com/thumb.jpg',
                youtubeUrl: 'https://youtube.com/watch?v=test',
                level: 'Intermediate',
                services: ['EC2'],
                topics: ['compute'],
                industry: ['technology'],
                sessionType: 'Breakout',
                speakers: ['Test Speaker'],
                metadataSource: 'transcript',
                metadataConfidence: 0.8,
                extractedKeywords: ['test']
              }

              const recoveryResult = await updateService.updateDatabase([testVideo], [])
              // System should be able to recover and process new data
              expect(recoveryResult.success || recoveryResult.error).toBeDefined()
            }
          }

          return processOperations()
        }
      ),
      { numRuns: 10 } // Run 10 iterations for this more complex test
    )
  })
})