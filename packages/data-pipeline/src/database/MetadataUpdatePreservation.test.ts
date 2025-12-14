/**
 * Property-based test for metadata update preservation
 * **Feature: video-search-platform, Property 14: Metadata update preservation**
 * **Validates: Requirements 8.5**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { DatabaseService } from './DatabaseService.js'
import { DatabaseUpdateService } from './DatabaseUpdateService.js'
import type { VideoMetadata, VideoSegment } from '@aws-reinvent-search/shared'

describe('Metadata Update Preservation Property Tests', () => {
  let dbService: DatabaseService
  let updateService: DatabaseUpdateService
  const testOutputPath = './test-metadata-preservation'

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
    // Don't close database here - let each test manage its own lifecycle
  })

  // Generators for test data
  const videoMetadataArb: fc.Arbitrary<VideoMetadata> = fc.record({
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

  const videoSegmentArb: fc.Arbitrary<VideoSegment> = fc.record({
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
   * **Feature: video-search-platform, Property 14: Metadata update preservation**
   * **Validates: Requirements 8.5**
   * 
   * For any video with changing metadata, the system should update the new information 
   * while preserving the original video record and associated segments in the database
   */
  it('should preserve original video record when updating metadata', () => {
    fc.assert(
      fc.property(
        videoMetadataArb,
        videoSegmentArb,
        fc.record({
          title: fc.option(fc.string({ minLength: 1, maxLength: 200 })),
          description: fc.option(fc.string({ maxLength: 1000 })),
          level: fc.option(fc.constantFrom('Introductory', 'Intermediate', 'Advanced', 'Expert', 'Unknown')),
          services: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 })),
          topics: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 })),
          speakers: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 3 })),
          metadataConfidence: fc.option(fc.float({ min: 0, max: 1 }))
        }),
        (originalVideo, originalSegment, metadataUpdates) => {
          // Ensure segment references the video
          const segment = { ...originalSegment, videoId: originalVideo.id }

          return (async () => {
            // Insert original video and segment
            await updateService.updateDatabase([originalVideo], [segment])

            // Verify original data is stored
            const originalStored = dbService.getVideo(originalVideo.id)
            expect(originalStored).toBeDefined()
            expect(originalStored!.id).toBe(originalVideo.id)
            expect(originalStored!.title).toBe(originalVideo.title)

            const originalSegments = dbService.getVideoSegments(originalVideo.id)
            expect(originalSegments).toHaveLength(1)
            expect(originalSegments[0].id).toBe(segment.id)

            // Create updated video with changed metadata
            const updatedVideo: VideoMetadata = {
              ...originalVideo,
              // Apply metadata updates if provided
              ...(metadataUpdates.title && { title: metadataUpdates.title }),
              ...(metadataUpdates.description && { description: metadataUpdates.description }),
              ...(metadataUpdates.level && { level: metadataUpdates.level }),
              ...(metadataUpdates.services && { services: metadataUpdates.services }),
              ...(metadataUpdates.topics && { topics: metadataUpdates.topics }),
              ...(metadataUpdates.speakers && { speakers: metadataUpdates.speakers }),
              ...(metadataUpdates.metadataConfidence && { metadataConfidence: metadataUpdates.metadataConfidence })
            }

            // Update the video with new metadata
            await updateService.updateDatabase([updatedVideo], [segment])

            // Verify the video record is preserved but updated
            const updatedStored = dbService.getVideo(originalVideo.id)
            expect(updatedStored).toBeDefined()
            expect(updatedStored!.id).toBe(originalVideo.id) // Same ID (preserved)
            
            // Check that updates were applied
            if (metadataUpdates.title) {
              expect(updatedStored!.title).toBe(metadataUpdates.title)
            }
            if (metadataUpdates.level) {
              expect(updatedStored!.level).toBe(metadataUpdates.level)
            }
            if (metadataUpdates.services) {
              expect(updatedStored!.services).toEqual(metadataUpdates.services)
            }

            // Verify segments are preserved
            const preservedSegments = dbService.getVideoSegments(originalVideo.id)
            expect(preservedSegments).toHaveLength(1)
            expect(preservedSegments[0].id).toBe(segment.id)
            expect(preservedSegments[0].videoId).toBe(originalVideo.id)

            // Verify database integrity
            const validation = await updateService.validateDatabase()
            expect(validation.valid).toBe(true)

            // Clean up database connection
            dbService.close()
          })()
        }
      ),
      { numRuns: 50 } // Run 50 iterations to test various metadata update scenarios
    )
  })

  /**
   * **Feature: video-search-platform, Property 14: Metadata update preservation**
   * **Validates: Requirements 8.5**
   * 
   * For any video with multiple segments, updating metadata should preserve all segments
   */
  it('should preserve all segments when updating video metadata', () => {
    fc.assert(
      fc.property(
        videoMetadataArb,
        fc.array(videoSegmentArb, { minLength: 2, maxLength: 5 }),
        fc.string({ minLength: 1, maxLength: 200 }), // New title
        (originalVideo, originalSegments, newTitle) => {
          // Ensure all segments reference the video
          const segments = originalSegments.map((seg, index) => ({
            ...seg,
            id: `segment-${index}`,
            videoId: originalVideo.id
          }))

          return (async () => {
            // Insert original video and segments
            await updateService.updateDatabase([originalVideo], segments)

            // Verify original segments are stored
            const originalStoredSegments = dbService.getVideoSegments(originalVideo.id)
            expect(originalStoredSegments).toHaveLength(segments.length)

            // Update video metadata (title change)
            const updatedVideo: VideoMetadata = {
              ...originalVideo,
              title: newTitle
            }

            await updateService.updateDatabase([updatedVideo], segments)

            // Verify video metadata was updated
            const updatedStored = dbService.getVideo(originalVideo.id)
            expect(updatedStored).toBeDefined()
            expect(updatedStored!.title).toBe(newTitle)

            // Verify ALL segments are preserved
            const preservedSegments = dbService.getVideoSegments(originalVideo.id)
            expect(preservedSegments).toHaveLength(segments.length)

            // Verify each segment is preserved with correct data
            for (let i = 0; i < segments.length; i++) {
              const originalSeg = segments[i]
              const preservedSeg = preservedSegments.find(s => s.id === originalSeg.id)
              expect(preservedSeg).toBeDefined()
              expect(preservedSeg!.videoId).toBe(originalVideo.id)
              expect(preservedSeg!.text).toBe(originalSeg.text)
              expect(preservedSeg!.startTime).toBe(originalSeg.startTime)
              expect(preservedSeg!.endTime).toBe(originalSeg.endTime)
            }

            // Verify database integrity
            const validation = await updateService.validateDatabase()
            expect(validation.valid).toBe(true)

            // Clean up database connection
            dbService.close()
          })()
        }
      ),
      { numRuns: 30 } // Run 30 iterations
    )
  })

  /**
   * **Feature: video-search-platform, Property 14: Metadata update preservation**
   * **Validates: Requirements 8.5**
   * 
   * For any sequence of metadata updates, the video should maintain its identity
   * while reflecting the latest metadata changes
   */
  it('should maintain video identity through multiple metadata updates', () => {
    fc.assert(
      fc.property(
        videoMetadataArb,
        videoSegmentArb,
        fc.array(fc.record({
          title: fc.string({ minLength: 1, maxLength: 200 }),
          level: fc.constantFrom('Introductory', 'Intermediate', 'Advanced', 'Expert', 'Unknown'),
          metadataConfidence: fc.float({ min: 0, max: 1 })
        }), { minLength: 2, maxLength: 5 }),
        (originalVideo, originalSegment, metadataUpdates) => {
          // Ensure segment references the video
          const segment = { ...originalSegment, videoId: originalVideo.id }

          return (async () => {
            // Insert original video and segment
            await updateService.updateDatabase([originalVideo], [segment])

            let currentVideo = originalVideo

            // Apply each metadata update sequentially
            for (const update of metadataUpdates) {
              const updatedVideo: VideoMetadata = {
                ...currentVideo,
                title: update.title,
                level: update.level,
                metadataConfidence: update.metadataConfidence
              }

              await updateService.updateDatabase([updatedVideo], [segment])

              // Verify video identity is maintained
              const storedVideo = dbService.getVideo(originalVideo.id)
              expect(storedVideo).toBeDefined()
              expect(storedVideo!.id).toBe(originalVideo.id) // Identity preserved
              expect(storedVideo!.channelId).toBe(originalVideo.channelId) // Core data preserved
              expect(storedVideo!.youtubeUrl).toBe(originalVideo.youtubeUrl) // Core data preserved

              // Verify updates were applied
              expect(storedVideo!.title).toBe(update.title)
              expect(storedVideo!.level).toBe(update.level)
              expect(storedVideo!.metadataConfidence).toBe(update.metadataConfidence)

              // Verify segment is still preserved
              const segments = dbService.getVideoSegments(originalVideo.id)
              expect(segments).toHaveLength(1)
              expect(segments[0].id).toBe(segment.id)

              currentVideo = updatedVideo
            }

            // Final verification of database integrity
            const validation = await updateService.validateDatabase()
            expect(validation.valid).toBe(true)

            // Verify final state has the last update
            const finalVideo = dbService.getVideo(originalVideo.id)
            const lastUpdate = metadataUpdates[metadataUpdates.length - 1]
            expect(finalVideo!.title).toBe(lastUpdate.title)
            expect(finalVideo!.level).toBe(lastUpdate.level)
            expect(finalVideo!.metadataConfidence).toBe(lastUpdate.metadataConfidence)

            // Clean up database connection
            dbService.close()
          })()
        }
      ),
      { numRuns: 25 } // Run 25 iterations for this more complex test
    )
  })
})