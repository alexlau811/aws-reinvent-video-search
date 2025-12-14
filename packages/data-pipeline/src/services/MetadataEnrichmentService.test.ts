/**
 * Tests for MetadataEnrichmentService
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { MetadataEnrichmentServiceImpl } from './MetadataEnrichmentService.js'
import type { ExtractedMetadata } from '@aws-reinvent-search/shared'

describe('MetadataEnrichmentService', () => {
  let service: MetadataEnrichmentServiceImpl

  beforeEach(() => {
    service = new MetadataEnrichmentServiceImpl()
  })

  afterEach(async () => {
    await service.cleanup()
  })

  describe('combineMetadata', () => {
    it('should combine metadata from transcript and video sources', () => {
      const transcriptMeta: ExtractedMetadata = {
        inferredServices: ['Lambda', 'API Gateway'],
        inferredTopics: ['Serverless', 'APIs'],
        inferredLevel: 'Intermediate',
        sessionType: 'Workshop',
        speakers: ['John Doe'],
        keyTerms: ['serverless', 'api'],
        confidence: 0.8
      }

      const videoMeta: ExtractedMetadata = {
        inferredServices: ['S3'],
        inferredTopics: ['Storage'],
        inferredLevel: 'Advanced',
        sessionType: 'Breakout',
        speakers: ['Jane Smith'],
        keyTerms: ['storage'],
        confidence: 0.6
      }

      const result = service.combineMetadata(transcriptMeta, videoMeta)

      expect(result.level).toBe('Intermediate') // Transcript takes priority
      expect(result.services).toEqual(['Lambda', 'API Gateway', 'S3']) // Combined
      expect(result.topics).toEqual(['Serverless', 'APIs', 'Storage']) // Combined
      expect(result.sessionType).toBe('Workshop') // Transcript takes priority
      expect(result.speakers).toEqual(['John Doe', 'Jane Smith']) // Combined
      expect(result.dataSource).toBe('combined')
      expect(result.confidence).toBe(0.8) // Higher confidence
      expect(result.extractedKeywords).toEqual(['serverless', 'api', 'storage']) // Combined
    })

    it('should use video metadata when transcript has unknown values', () => {
      const transcriptMeta: ExtractedMetadata = {
        inferredServices: [],
        inferredTopics: [],
        inferredLevel: 'Unknown',
        sessionType: 'Unknown',
        speakers: [],
        keyTerms: [],
        confidence: 0.0
      }

      const videoMeta: ExtractedMetadata = {
        inferredServices: ['S3'],
        inferredTopics: ['Storage'],
        inferredLevel: 'Advanced',
        sessionType: 'Breakout',
        speakers: ['Jane Smith'],
        keyTerms: ['storage'],
        confidence: 0.6
      }

      const result = service.combineMetadata(transcriptMeta, videoMeta)

      expect(result.level).toBe('Advanced')
      expect(result.sessionType).toBe('Breakout')
      expect(result.dataSource).toBe('video-metadata')
      expect(result.confidence).toBe(0.6)
    })
  })

  describe('extractFromTranscript', () => {
    it('should extract AWS services from transcript', async () => {
      const transcript = 'This session covers AWS Lambda and Amazon S3 for serverless computing and storage.'
      
      const result = await service.extractFromTranscript(transcript)

      expect(result.inferredServices).toContain('Lambda')
      expect(result.inferredServices).toContain('S3')
      expect(result.inferredTopics).toContain('Architecture')
      expect(result.keyTerms).toContain('serverless')
      expect(result.confidence).toBeGreaterThan(0.5)
    })

    it('should infer technical level from content', async () => {
      const transcript = 'This is an introduction to AWS basics for beginners getting started with cloud computing.'
      
      const result = await service.extractFromTranscript(transcript)

      expect(result.inferredLevel).toBe('Introductory')
    })

    it('should handle advanced content', async () => {
      const transcript = 'Deep dive into advanced architecture patterns and performance optimization techniques for enterprise workloads.'
      
      const result = await service.extractFromTranscript(transcript)

      expect(result.inferredLevel).toBe('Advanced')
    })
  })

  describe('level normalization', () => {
    it('should normalize various level formats correctly', () => {
      const service = new MetadataEnrichmentServiceImpl()
      
      const normalizeLevel = (service as any).normalizeLevel.bind(service)
      
      expect(normalizeLevel('Introductory')).toBe('Introductory')
      expect(normalizeLevel('intro')).toBe('Introductory')
      expect(normalizeLevel('beginner')).toBe('Introductory')
      
      expect(normalizeLevel('Intermediate')).toBe('Intermediate')
      expect(normalizeLevel('Advanced')).toBe('Advanced')
      expect(normalizeLevel('Expert')).toBe('Expert')
      expect(normalizeLevel('Unknown')).toBe('Unknown')
    })
  })

  describe('session type inference', () => {
    it('should infer session type from transcript content', () => {
      const service = new MetadataEnrichmentServiceImpl()
      
      const inferSessionTypeFromTranscript = (service as any).inferSessionTypeFromTranscript.bind(service)
      
      expect(inferSessionTypeFromTranscript('This is a hands-on workshop session')).toBe('Workshop')
      expect(inferSessionTypeFromTranscript('Welcome to our keynote announcement')).toBe('Keynote')
      expect(inferSessionTypeFromTranscript('This lightning talk will be quick')).toBe('Lightning Talk')
      expect(inferSessionTypeFromTranscript('Join our chalk talk discussion')).toBe('Chalk Talk')
      expect(inferSessionTypeFromTranscript('Technical deep-dive session')).toBe('Breakout')
    })

    it('should infer session type from video metadata', () => {
      const service = new MetadataEnrichmentServiceImpl()
      
      const inferSessionTypeFromMetadata = (service as any).inferSessionTypeFromMetadata.bind(service)
      
      expect(inferSessionTypeFromMetadata('Workshop: Hands-on Lab', 'Interactive workshop session')).toBe('Workshop')
      expect(inferSessionTypeFromMetadata('Keynote: Opening Remarks', 'Opening keynote presentation')).toBe('Keynote')
      expect(inferSessionTypeFromMetadata('Lightning Talk: Quick Tips', 'Fast-paced presentation')).toBe('Lightning Talk')
      expect(inferSessionTypeFromMetadata('Chalk Talk: Discussion', 'Interactive discussion session')).toBe('Chalk Talk')
      expect(inferSessionTypeFromMetadata('Technical Session', 'Deep technical content')).toBe('Breakout')
    })
  })

  describe('extractLevelFromTitle', () => {
    it('should extract level from session codes in titles', () => {
      const service = new MetadataEnrichmentServiceImpl()
      
      expect(service.extractLevelFromTitle('GBL206: Building Scalable Applications')).toBe('Intermediate')
      expect(service.extractLevelFromTitle('WPS301: Advanced Workshop')).toBe('Advanced')
      expect(service.extractLevelFromTitle('SEC401: Expert Security Practices')).toBe('Expert')
      expect(service.extractLevelFromTitle('INT101: Introduction to AWS')).toBe('Introductory')
      expect(service.extractLevelFromTitle('No session code here')).toBe('Unknown')
      expect(service.extractLevelFromTitle('ABC999: Invalid level')).toBe('Unknown')
    })
  })

  describe('Property-Based Tests', () => {
    /**
     * **Feature: transcript-processing-enhancement, Property 3: Level mapping correctness**
     * **Validates: Requirements 3.1, 3.3**
     * 
     * For any video title containing a session code with level indicator (1xx, 2xx, 3xx, 4xx), 
     * the extracted level should correctly map to Introductory, Intermediate, Advanced, or Expert respectively
     */
    it('should correctly map session code level indicators to difficulty levels', () => {
      fc.assert(
        fc.property(
          // Generate session codes with valid level indicators
          fc.record({
            prefix: fc.stringOf(fc.char().filter(c => /[A-Z]/.test(c)), { minLength: 2, maxLength: 4 }),
            levelDigit: fc.integer({ min: 1, max: 4 }),
            sessionNumber: fc.integer({ min: 0, max: 99 }),
            title: fc.string({ minLength: 5, maxLength: 50 })
          }),

          ({ prefix, levelDigit, sessionNumber, title }) => {
            const service = new MetadataEnrichmentServiceImpl()
            
            // Create session code like "GBL206", "WPS301", etc.
            const sessionCode = `${prefix}${levelDigit}${sessionNumber.toString().padStart(2, '0')}`
            const fullTitle = `${sessionCode}: ${title}`
            
            const extractedLevel = service.extractLevelFromTitle(fullTitle)
            
            // Property: Level digit should map correctly to difficulty level
            switch (levelDigit) {
              case 1:
                if (extractedLevel !== 'Introductory') {
                  throw new Error(`Level 1xx should map to Introductory, got ${extractedLevel} for ${sessionCode}`)
                }
                break
              case 2:
                if (extractedLevel !== 'Intermediate') {
                  throw new Error(`Level 2xx should map to Intermediate, got ${extractedLevel} for ${sessionCode}`)
                }
                break
              case 3:
                if (extractedLevel !== 'Advanced') {
                  throw new Error(`Level 3xx should map to Advanced, got ${extractedLevel} for ${sessionCode}`)
                }
                break
              case 4:
                if (extractedLevel !== 'Expert') {
                  throw new Error(`Level 4xx should map to Expert, got ${extractedLevel} for ${sessionCode}`)
                }
                break
              default:
                throw new Error(`Unexpected level digit: ${levelDigit}`)
            }
          }
        ),
        { numRuns: 100 } // Run 100 iterations as specified in design document
      )
    })

    /**
     * **Feature: video-search-platform, Property 13: Metadata enrichment completeness**
     * **Validates: Requirements 4.3, 4.4**
     * 
     * For any processed video, the system should extract metadata from both transcript content 
     * and video metadata using yt-dlp, ensuring every video has level, services, topics, 
     * and session type information
     */
    it('should ensure metadata enrichment completeness for any video processing scenario', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary transcript content
          fc.string({ minLength: 50, maxLength: 500 }).filter(transcript => 
            transcript.trim().length > 20 && /[a-zA-Z]/.test(transcript)
          ),
          // Generate arbitrary video metadata
          fc.record({
            title: fc.string({ minLength: 10, maxLength: 100 }),
            description: fc.string({ minLength: 20, maxLength: 300 }),
            tags: fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 0, maxLength: 10 })
          }),

          async (transcript, videoMetadata) => {
            const service = new MetadataEnrichmentServiceImpl()
            
            try {
              // Test the complete metadata enrichment process using both sources
              const transcriptMeta = await service.extractFromTranscript(transcript)
              const videoMeta = await service.extractFromVideoMetadata(videoMetadata)
              const enrichedMetadata = service.combineMetadata(transcriptMeta, videoMeta)
              
              // Property: Every processed video must have complete metadata
              
              // 1. Must have a valid level (not undefined/null)
              if (!enrichedMetadata.level) {
                throw new Error(`Level is undefined or null`)
              }
              if (!['Introductory', 'Intermediate', 'Advanced', 'Expert', 'Unknown'].includes(enrichedMetadata.level)) {
                throw new Error(`Invalid level: ${enrichedMetadata.level}`)
              }
              
              // 2. Must have services array (can be empty but must exist)
              if (!Array.isArray(enrichedMetadata.services)) {
                throw new Error(`Services is not an array: ${typeof enrichedMetadata.services}`)
              }
              
              // 3. Must have topics array (can be empty but must exist)
              if (!Array.isArray(enrichedMetadata.topics)) {
                throw new Error(`Topics is not an array: ${typeof enrichedMetadata.topics}`)
              }
              
              // 4. Must have industry array (can be empty but must exist)
              if (!Array.isArray(enrichedMetadata.industry)) {
                throw new Error(`Industry is not an array: ${typeof enrichedMetadata.industry}`)
              }
              
              // 5. Must have a valid session type
              if (!enrichedMetadata.sessionType) {
                throw new Error(`Session type is undefined or null`)
              }
              if (!['Breakout', 'Chalk Talk', 'Workshop', 'Keynote', 'Lightning Talk', 'Unknown'].includes(enrichedMetadata.sessionType)) {
                throw new Error(`Invalid session type: ${enrichedMetadata.sessionType}`)
              }
              
              // 6. Must have speakers array (can be empty but must exist)
              if (!Array.isArray(enrichedMetadata.speakers)) {
                throw new Error(`Speakers is not an array: ${typeof enrichedMetadata.speakers}`)
              }
              
              // 7. Must have a valid data source
              if (!['transcript', 'video-metadata', 'combined'].includes(enrichedMetadata.dataSource)) {
                throw new Error(`Invalid data source: ${enrichedMetadata.dataSource}`)
              }
              
              // 8. Must have a confidence score between 0 and 1
              if (typeof enrichedMetadata.confidence !== 'number' || enrichedMetadata.confidence < 0 || enrichedMetadata.confidence > 1) {
                throw new Error(`Invalid confidence score: ${enrichedMetadata.confidence}`)
              }
              
              // 9. Must have extracted keywords array
              if (!Array.isArray(enrichedMetadata.extractedKeywords)) {
                throw new Error(`Extracted keywords is not an array: ${typeof enrichedMetadata.extractedKeywords}`)
              }
              
              // 10. Confidence should be the maximum of both sources
              const expectedConfidence = Math.max(transcriptMeta.confidence, videoMeta.confidence)
              if (Math.abs(enrichedMetadata.confidence - expectedConfidence) > 0.001) {
                throw new Error(`Confidence should be max of both sources: expected ${expectedConfidence}, got ${enrichedMetadata.confidence}`)
              }
              
              // 11. Services should be combined from both sources
              const expectedServices = [...new Set([...transcriptMeta.inferredServices, ...videoMeta.inferredServices])]
              if (JSON.stringify(enrichedMetadata.services.sort()) !== JSON.stringify(expectedServices.sort())) {
                throw new Error(`Services should be combined from both sources`)
              }
              
              // 12. Topics should be combined from both sources
              const expectedTopics = [...new Set([...transcriptMeta.inferredTopics, ...videoMeta.inferredTopics])]
              if (JSON.stringify(enrichedMetadata.topics.sort()) !== JSON.stringify(expectedTopics.sort())) {
                throw new Error(`Topics should be combined from both sources`)
              }
              
              // 13. Data source should reflect the combination strategy
              if (transcriptMeta.confidence === 0 && videoMeta.confidence > 0) {
                if (enrichedMetadata.dataSource !== 'video-metadata') {
                  throw new Error(`Expected video-metadata data source when only video metadata available`)
                }
              } else if (videoMeta.confidence === 0 && transcriptMeta.confidence > 0) {
                if (enrichedMetadata.dataSource !== 'transcript') {
                  throw new Error(`Expected transcript data source when only transcript available`)
                }
              } else if (transcriptMeta.confidence > 0 && videoMeta.confidence > 0) {
                if (enrichedMetadata.dataSource !== 'combined') {
                  throw new Error(`Expected combined data source when both sources available`)
                }
              }
              
            } finally {
              await service.cleanup()
            }
          }
        ),
        { numRuns: 100 } // Run 100 iterations as specified in design document
      )
    })
  })
})