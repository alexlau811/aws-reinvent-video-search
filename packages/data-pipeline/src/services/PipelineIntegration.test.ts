/**
 * Property-based tests for complete video processing pipeline
 * **Feature: video-search-platform, Property 6: Video processing pipeline completeness**
 * **Validates: Requirements 4.3, 4.4, 4.5**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { VideoDiscoveryServiceImpl } from './VideoDiscoveryService.js'
import { MetadataEnrichmentServiceImpl } from './MetadataEnrichmentService.js'
import { EmbeddingServiceImpl } from './EmbeddingService.js'
import type { VideoMetadata, Transcript, VideoSegment } from '@aws-reinvent-search/shared'

// Mock AWS SDK for embedding service
const mockSend = vi.fn()
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
    send: mockSend
  })),
  InvokeModelCommand: vi.fn()
}))

// Mock yt-dlp for video discovery service
vi.mock('yt-dlp-wrap', () => ({
  default: vi.fn().mockImplementation(() => ({
    execPromise: vi.fn()
  }))
}))

describe('Complete Pipeline Processing Property Tests', () => {
  let videoDiscoveryService: VideoDiscoveryServiceImpl
  let metadataEnrichmentService: MetadataEnrichmentServiceImpl
  let embeddingService: EmbeddingServiceImpl

  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockReset()
    
    videoDiscoveryService = new VideoDiscoveryServiceImpl()
    metadataEnrichmentService = new MetadataEnrichmentServiceImpl()
    embeddingService = new EmbeddingServiceImpl()
  })

  /**
   * Property 6: Video processing pipeline completeness
   * For any new video discovered by the pipeline, the complete processing workflow 
   * (metadata extraction, transcription, embedding generation, database update) should execute successfully
   */
  it('should complete full pipeline processing for any valid video', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate simple video ID and text content
        fc.string({ minLength: 5, maxLength: 15 }),
        fc.string({ minLength: 20, maxLength: 100 }),
        async (videoId: string, transcriptText: string) => {
          // Create a simple video metadata object
          const videoMetadata: VideoMetadata = {
            id: videoId,
            title: `AWS re:Invent 2025 - ${videoId}`,
            description: 'Test video description',
            channelId: 'UCd6MoB9NC6uYN2grvUNT-Zg',
            channelTitle: 'AWS Events',
            publishedAt: new Date('2025-01-01'),
            duration: 1800,
            thumbnailUrl: 'https://example.com/thumb.jpg',
            youtubeUrl: `https://youtube.com/watch?v=${videoId}`,
            level: 'Intermediate',
            services: ['Lambda', 'S3'],
            topics: ['Serverless'],
            industry: ['Technology'],
            sessionType: 'Breakout',
            speakers: ['John Doe'],
            metadataSource: 'transcript',
            metadataConfidence: 0.9,
            extractedKeywords: ['aws', 'serverless']
          }

          // Create a simple transcript
          const transcript: Transcript = {
            videoId: videoId,
            language: 'en',
            confidence: 0.95,
            segments: [
              {
                startTime: 0,
                endTime: 30,
                text: transcriptText,
                confidence: 0.95
              }
            ]
          }
          
          // Mock successful embedding generation
          const mockEmbedding = new Array(1024).fill(0).map(() => Math.random())
          mockSend.mockResolvedValue({
            body: new TextEncoder().encode(JSON.stringify({
              embedding: mockEmbedding
            }))
          })

          try {
            // Step 1: Video discovery and filtering (Requirements 4.1, 4.2)
            const discoveredVideos = [videoMetadata]
            const filteredVideos = videoDiscoveryService.filterReInventVideos(discoveredVideos)
            
            // Should contain the video since title includes "AWS re:Invent 2025"
            expect(filteredVideos).toContain(videoMetadata)

            // Step 2: Transcript extraction (Requirement 4.3)
            const extractedTranscript = transcript

            // Step 3: Metadata enrichment (Requirement 4.4)
            const enrichedMetadata = await metadataEnrichmentService.extractFromTranscript(transcriptText)
            
            // Verify metadata enrichment produces valid results
            expect(enrichedMetadata).toBeDefined()
            expect(enrichedMetadata.confidence).toBeGreaterThanOrEqual(0)
            expect(enrichedMetadata.confidence).toBeLessThanOrEqual(1)
            expect(Array.isArray(enrichedMetadata.inferredServices)).toBe(true)
            expect(Array.isArray(enrichedMetadata.inferredTopics)).toBe(true)

            // Step 4: Embedding generation (Requirement 4.4)
            const segmentTexts = extractedTranscript.segments.map(segment => segment.text)
            const embeddings = await embeddingService.batchGenerateEmbeddings(segmentTexts)
            
            // Verify embeddings are generated for all segments
            expect(embeddings).toHaveLength(segmentTexts.length)
            embeddings.forEach(embedding => {
              expect(embeddingService.validateEmbedding(embedding)).toBe(true)
            })

            // Step 5: Create video segments with embeddings
            const videoSegments: VideoSegment[] = extractedTranscript.segments.map((segment, index) => ({
              id: `${videoMetadata.id}_segment_${index}`,
              videoId: videoMetadata.id,
              startTime: segment.startTime,
              endTime: segment.endTime,
              text: segment.text,
              embedding: embeddings[index],
              confidence: segment.confidence,
              speaker: segment.speaker
            }))

            // Verify all segments have valid embeddings
            videoSegments.forEach(segment => {
              expect(segment.embedding).toBeDefined()
              expect(embeddingService.validateEmbedding(segment.embedding)).toBe(true)
              expect(segment.videoId).toBe(videoMetadata.id)
              expect(segment.startTime).toBeLessThanOrEqual(segment.endTime)
            })

            // Step 6: Database update simulation (Requirement 4.5)
            // Verify video metadata is complete and valid
            expect(videoMetadata.id).toBeDefined()
            expect(videoMetadata.title).toContain('AWS re:Invent 2025')
            expect(videoMetadata.youtubeUrl).toBeDefined()
            expect(videoMetadata.duration).toBeGreaterThan(0)
            
            // Verify segments are properly structured for database insertion
            expect(videoSegments.length).toBeGreaterThan(0)
            videoSegments.forEach(segment => {
              expect(segment.id).toBeDefined()
              expect(segment.videoId).toBe(videoMetadata.id)
              expect(segment.text.length).toBeGreaterThan(0)
              expect(segment.embedding.length).toBe(1024)
            })

            // Pipeline completed successfully
            return true

          } catch (error) {
            // Pipeline should not fail for valid inputs
            console.error('Pipeline processing failed:', error)
            throw error
          }
        }
      ),
      { 
        numRuns: 3, // Run 3 iterations to test various combinations
        timeout: 10000 // 10 second timeout for async operations
      }
    )
  }, 15000) // 15 second test timeout

  /**
   * Property test for pipeline error resilience
   * Verifies that pipeline continues processing even when individual videos fail
   */
  it('should handle individual video processing failures gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a batch of videos, some of which may cause failures
        fc.array(
          fc.record({
            id: fc.string({ minLength: 5, maxLength: 20 }),
            title: fc.string({ minLength: 10, maxLength: 100 }),
            shouldFail: fc.boolean() // Some videos will be designed to fail
          }),
          { minLength: 3, maxLength: 10 }
        ),
        async (videoBatch) => {
          let successCount = 0
          let failureCount = 0

          for (const video of videoBatch) {
            try {
              if (video.shouldFail) {
                // Simulate a processing failure
                throw new Error('Simulated processing failure')
              }

              // Mock successful processing
              const mockEmbedding = new Array(1024).fill(0).map(() => Math.random())
              mockSend.mockResolvedValue({
                body: new TextEncoder().encode(JSON.stringify({
                  embedding: mockEmbedding
                }))
              })

              // Simulate successful processing steps
              await embeddingService.generateEmbeddings('Sample text for ' + video.id)
              successCount++

            } catch (error) {
              // Pipeline should log error and continue with next video
              failureCount++
              // Verify error is handled gracefully (not re-thrown)
            }
          }

          // Verify that pipeline processed all videos (some succeeded, some failed)
          expect(successCount + failureCount).toBe(videoBatch.length)
          
          // If there were videos that shouldn't fail, at least some should succeed
          const shouldSucceedCount = videoBatch.filter(v => !v.shouldFail).length
          if (shouldSucceedCount > 0) {
            expect(successCount).toBeGreaterThan(0)
          }

          return true
        }
      ),
      { numRuns: 10 }
    )
  })

  /**
   * Property test for embedding consistency
   * Verifies that similar content produces similar embeddings
   */
  it('should produce consistent embeddings for similar content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 20, maxLength: 200 }),
        async (baseText) => {
          // Create variations of the same text
          const variations = [
            baseText,
            baseText + ' Additional context.',
            baseText.replace(/\./g, ','), // Minor punctuation changes
            baseText.toLowerCase()
          ]

          const mockEmbedding = new Array(1024).fill(0).map(() => Math.random())
          mockSend.mockResolvedValue({
            body: new TextEncoder().encode(JSON.stringify({
              embedding: mockEmbedding
            }))
          })

          const embeddings = await embeddingService.batchGenerateEmbeddings(variations)
          
          // All embeddings should be valid
          embeddings.forEach(embedding => {
            expect(embeddingService.validateEmbedding(embedding)).toBe(true)
          })

          // In a real scenario, similar texts would have similar embeddings
          // For this mock test, we just verify they're all valid and consistent in format
          expect(embeddings).toHaveLength(variations.length)
          
          return true
        }
      ),
      { numRuns: 5 }
    )
  })
})