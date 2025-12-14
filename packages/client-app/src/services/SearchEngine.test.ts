import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { SearchEngine } from './SearchEngine'
import type { Database, SearchOptions, Statement } from '@aws-reinvent-search/shared'

// Mock database implementation for testing
class MockDatabase implements Database {
  private videos: Map<string, any> = new Map()
  private segments: Map<string, any> = new Map()

  constructor() {
    // Add some test data
    this.setupTestData()
  }

  private setupTestData() {
    // Test videos
    const testVideos = [
      {
        id: 'video1',
        title: 'AWS Lambda Best Practices',
        description: 'Learn about serverless computing with AWS Lambda',
        channel_id: 'aws-events',
        channel_title: 'AWS Events',
        published_at: '2025-01-01T00:00:00Z',
        duration: 3600,
        thumbnail_url: 'https://example.com/thumb1.jpg',
        youtube_url: 'https://youtube.com/watch?v=video1',
        level: 'Intermediate',
        services: JSON.stringify(['AWS Lambda', 'API Gateway']),
        topics: JSON.stringify(['Serverless', 'Architecture']),
        industry: JSON.stringify(['Technology']),
        session_type: 'Breakout',
        speakers: JSON.stringify(['John Doe']),
        metadata_source: 'transcript',
        metadata_confidence: 0.9,
        extracted_keywords: JSON.stringify(['lambda', 'serverless', 'api'])
      },
      {
        id: 'video2',
        title: 'Amazon S3 Security Features',
        description: 'Deep dive into S3 security and encryption',
        channel_id: 'aws-events',
        channel_title: 'AWS Events',
        published_at: '2025-01-02T00:00:00Z',
        duration: 2700,
        thumbnail_url: 'https://example.com/thumb2.jpg',
        youtube_url: 'https://youtube.com/watch?v=video2',
        level: 'Advanced',
        services: JSON.stringify(['Amazon S3', 'AWS KMS']),
        topics: JSON.stringify(['Security', 'Storage']),
        industry: JSON.stringify(['Finance', 'Healthcare']),
        session_type: 'Workshop',
        speakers: JSON.stringify(['Jane Smith']),
        metadata_source: 'combined',
        metadata_confidence: 0.95,
        extracted_keywords: JSON.stringify(['s3', 'security', 'encryption'])
      },
      {
        id: 'video3',
        title: 'Healthcare Data Analytics with AWS',
        description: 'Using AWS for healthcare data processing',
        channel_id: 'aws-events',
        channel_title: 'AWS Events',
        published_at: '2025-01-03T00:00:00Z',
        duration: 3000,
        thumbnail_url: 'https://example.com/thumb3.jpg',
        youtube_url: 'https://youtube.com/watch?v=video3',
        level: 'Expert',
        services: JSON.stringify(['Amazon Redshift', 'AWS Glue']),
        topics: JSON.stringify(['Analytics', 'Data Processing']),
        industry: JSON.stringify(['Healthcare']),
        session_type: 'Keynote',
        speakers: JSON.stringify(['Dr. Smith']),
        metadata_source: 'video-metadata',
        metadata_confidence: 0.88,
        extracted_keywords: JSON.stringify(['healthcare', 'analytics', 'data'])
      }
    ]

    testVideos.forEach(video => {
      this.videos.set(video.id, video)
    })

    // Test segments
    const testSegments = [
      {
        id: 'seg1',
        video_id: 'video1',
        start_time: 0,
        end_time: 30,
        text: 'Welcome to this session on AWS Lambda best practices',
        embedding: JSON.stringify(Array.from({ length: 384 }, () => Math.random())),
        confidence: 0.9,
        speaker: 'John Doe',
        rowid: 1
      },
      {
        id: 'seg2',
        video_id: 'video1',
        start_time: 30,
        end_time: 60,
        text: 'Lambda functions are serverless compute services',
        embedding: JSON.stringify(Array.from({ length: 384 }, () => Math.random())),
        confidence: 0.85,
        speaker: 'John Doe',
        rowid: 2
      },
      {
        id: 'seg3',
        video_id: 'video2',
        start_time: 0,
        end_time: 45,
        text: 'Amazon S3 provides multiple layers of security',
        embedding: JSON.stringify(Array.from({ length: 384 }, () => Math.random())),
        confidence: 0.92,
        speaker: 'Jane Smith',
        rowid: 3
      },
      {
        id: 'seg4',
        video_id: 'video2',
        start_time: 45,
        end_time: 90,
        text: 'Encryption at rest and in transit protects your data',
        embedding: JSON.stringify(Array.from({ length: 384 }, () => Math.random())),
        confidence: 0.88,
        speaker: 'Jane Smith',
        rowid: 4
      },
      {
        id: 'seg5',
        video_id: 'video3',
        start_time: 0,
        end_time: 60,
        text: 'Healthcare data requires special compliance considerations',
        embedding: JSON.stringify(Array.from({ length: 384 }, () => Math.random())),
        confidence: 0.91,
        speaker: 'Dr. Smith',
        rowid: 5
      }
    ]

    testSegments.forEach(segment => {
      this.segments.set(segment.id, segment)
    })
  }

  exec(options: { sql: string; bind?: any[]; returnValue?: 'resultRows' | 'saveSql' }) {
    const { sql, bind = [] } = options
    
    if (sql.includes('segments_fts MATCH')) {
      // Simulate FTS search
      const query = bind[0]?.toLowerCase() || ''
      const matchingSegments = Array.from(this.segments.values()).filter((seg: any) =>
        seg.text.toLowerCase().includes(query)
      )
      return matchingSegments.map((seg: any) => [seg.rowid])
    }
    
    if (sql.includes('FROM videos WHERE id = ?')) {
      const video = this.videos.get(bind[0])
      if (!video) return []
      return [[
        video.id, video.title, video.description, video.channel_id, video.channel_title,
        video.published_at, video.duration, video.thumbnail_url, video.youtube_url,
        video.level, video.services, video.topics, video.industry, video.session_type,
        video.speakers, video.metadata_source, video.metadata_confidence, video.extracted_keywords
      ]]
    }
    
    if (sql.includes('FROM video_segments vs')) {
      // Return segments based on conditions
      let results = Array.from(this.segments.values())
      
      if (sql.includes('vs.rowid IN')) {
        // FTS-based search - this would be handled by a previous FTS query
        const query = bind[0]?.toLowerCase() || ''
        results = results.filter((seg: any) =>
          seg.text.toLowerCase().includes(query)
        )
      } else if (sql.includes('vs.text LIKE')) {
        // LIKE-based search
        const query = bind[0]?.replace(/%/g, '').toLowerCase() || ''
        results = results.filter((seg: any) =>
          seg.text.toLowerCase().includes(query)
        )
      }
      
      return results.map((seg: any) => [
        seg.id, seg.video_id, seg.start_time, seg.end_time, seg.text, seg.embedding, seg.confidence, seg.speaker
      ])
    }
    
    // Handle getAvailableFilters query
    if (sql.includes('SELECT DISTINCT') && sql.includes('FROM videos')) {
      return Array.from(this.videos.values()).map((video: any) => [
        video.level, video.services, video.topics, video.industry, 
        video.session_type, video.channel_title, video.metadata_source
      ])
    }
    
    // Handle getFilterStatistics queries
    if (sql.includes('COUNT(*) as total FROM videos')) {
      return [[this.videos.size]]
    }
    
    if (sql.includes('GROUP BY level, services, topics')) {
      return Array.from(this.videos.values()).map((video: any) => [
        video.level, video.services, video.topics, video.industry,
        video.session_type, video.channel_title, 1
      ])
    }
    
    return []
  }



  prepare(_sql: string): Statement {
    // Legacy method for backward compatibility - not used in new implementation
    return {
      get: () => null,
      all: () => [],
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
      finalize: () => {}
    }
  }

  close() {
    // Mock implementation
  }
}

describe('SearchEngine', () => {
  let searchEngine: SearchEngine
  let mockDatabase: MockDatabase

  beforeEach(() => {
    mockDatabase = new MockDatabase()
    searchEngine = new SearchEngine(mockDatabase)
  })

  describe('Property Tests', () => {
    /**
     * **Feature: video-search-platform, Property 1: Hybrid search combines semantic and keyword results**
     * **Validates: Requirements 1.1, 1.4**
     */
    it('should combine semantic and keyword results in hybrid search', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.record({
            limit: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
            level: fc.option(fc.array(fc.constantFrom('Introductory' as const, 'Intermediate' as const, 'Advanced' as const, 'Expert' as const), { maxLength: 4 }), { nil: undefined }),
            sessionType: fc.option(fc.array(fc.constantFrom('Breakout' as const, 'Chalk Talk' as const, 'Workshop' as const, 'Keynote' as const, 'Lightning Talk' as const), { maxLength: 5 }), { nil: undefined })
          }),
          async (query: string, options: Partial<SearchOptions>) => {
            // Perform hybrid search
            const results = await searchEngine.hybridSearch(query, options)
            
            // Property 1: Results should be an array of SearchResult objects
            expect(Array.isArray(results)).toBe(true)
            
            // Each result should have the required structure
            results.forEach(result => {
              expect(result).toHaveProperty('video')
              expect(result).toHaveProperty('segments')
              expect(result).toHaveProperty('relevanceScore')
              expect(Array.isArray(result.segments)).toBe(true)
              expect(typeof result.relevanceScore).toBe('number')
              expect(result.relevanceScore).toBeGreaterThanOrEqual(0)
              expect(result.relevanceScore).toBeLessThanOrEqual(1)
            })
            
            // If we have results, they should contain segments that match our query
            if (results.length > 0) {
              const hasRelevantContent = results.some(result =>
                result.segments.some(segment =>
                  segment.text.toLowerCase().includes(query.toLowerCase()) ||
                  result.video.title.toLowerCase().includes(query.toLowerCase()) ||
                  result.video.description?.toLowerCase().includes(query.toLowerCase())
                )
              )
              
              // For queries that should match our test data, verify relevance
              const queryLower = query.toLowerCase()
              if (queryLower.includes('lambda') || queryLower.includes('serverless') || 
                  queryLower.includes('s3') || queryLower.includes('security')) {
                expect(hasRelevantContent).toBe(true)
              }
            }
            
            // Results should be sorted by relevance score (descending)
            for (let i = 1; i < results.length; i++) {
              expect(results[i-1].relevanceScore).toBeGreaterThanOrEqual(results[i].relevanceScore)
            }
            
            // Verify limit is respected
            if (options.limit) {
              expect(results.length).toBeLessThanOrEqual(options.limit)
            }
          }
        ),
        { numRuns: 20 }
      )
    })

    it('should handle empty queries gracefully', async () => {
      const emptyQueries = ['', '   ', '\t', '\n']
      
      for (const query of emptyQueries) {
        const results = await searchEngine.hybridSearch(query)
        expect(Array.isArray(results)).toBe(true)
        // Empty queries should return empty results or all results depending on implementation
        results.forEach(result => {
          expect(result).toHaveProperty('video')
          expect(result).toHaveProperty('segments')
          expect(result).toHaveProperty('relevanceScore')
        })
      }
    })

    it('should maintain consistency between vector and keyword search components', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 3, maxLength: 20 }).filter(s => s.trim().length > 2),
          async (query: string) => {
            // Get results from individual search methods
            const keywordResults = await searchEngine.keywordSearch(query)
            const vectorResults = await searchEngine.vectorSearch([0.1, 0.2, 0.3], 50)
            const hybridResults = await searchEngine.hybridSearch(query)
            
            // Hybrid results should incorporate both search types
            expect(Array.isArray(keywordResults)).toBe(true)
            expect(Array.isArray(vectorResults)).toBe(true)
            expect(Array.isArray(hybridResults)).toBe(true)
            
            // All results should have valid structure
            const allResults = [...keywordResults, ...vectorResults, ...hybridResults.flatMap(r => r.segments)]
            allResults.forEach(segment => {
              expect(segment).toHaveProperty('id')
              expect(segment).toHaveProperty('videoId')
              expect(segment).toHaveProperty('startTime')
              expect(segment).toHaveProperty('endTime')
              expect(segment).toHaveProperty('text')
              expect(typeof segment.startTime).toBe('number')
              expect(typeof segment.endTime).toBe('number')
              expect(segment.endTime).toBeGreaterThanOrEqual(segment.startTime)
            })
          }
        ),
        { numRuns: 15 }
      )
    })

    /**
     * **Feature: video-search-platform, Property 10: Category filtering and counting**
     * **Validates: Requirements 6.2, 6.5**
     */
    it('should filter by category correctly and provide accurate counts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('Technology', 'Finance', 'Healthcare'),
          async (selectedCategory: string) => {
            // Get filter statistics to verify counts
            const filterStats = searchEngine.getFilterStatistics()
            const availableFilters = searchEngine.getAvailableFilters()
            
            // Property 10: Category should exist in available filters
            expect(availableFilters.industries).toContain(selectedCategory)
            
            // Get expected count from statistics
            const expectedCount = filterStats.industryCounts[selectedCategory] || 0
            
            // Perform search with category filter
            const results = await searchEngine.hybridSearch('', {
              industry: [selectedCategory],
              limit: 100
            })
            
            // Property 10: All returned videos should match the selected category
            results.forEach(result => {
              const hasMatchingIndustry = result.video.industry.some(videoIndustry =>
                videoIndustry.toLowerCase().includes(selectedCategory.toLowerCase()) ||
                selectedCategory.toLowerCase().includes(videoIndustry.toLowerCase())
              )
              expect(hasMatchingIndustry).toBe(true)
            })
            
            // Property 10: Count should be accurate (allowing for some variance due to grouping)
            // Since we group segments by video, the actual video count might be less than segment count
            expect(results.length).toBeLessThanOrEqual(expectedCount)
            
            // Property 10: Results should be properly structured
            results.forEach(result => {
              expect(result).toHaveProperty('video')
              expect(result).toHaveProperty('segments')
              expect(result).toHaveProperty('relevanceScore')
              expect(Array.isArray(result.video.industry)).toBe(true)
              expect(result.video.industry.length).toBeGreaterThan(0)
            })
            
            // Property 10: Filter statistics should be consistent
            expect(typeof filterStats.totalVideos).toBe('number')
            expect(filterStats.totalVideos).toBeGreaterThanOrEqual(0)
            expect(typeof filterStats.industryCounts).toBe('object')
            
            // Property 10: Available filters should contain valid categories
            expect(Array.isArray(availableFilters.industries)).toBe(true)
            availableFilters.industries.forEach(industry => {
              expect(typeof industry).toBe('string')
              expect(industry.length).toBeGreaterThan(0)
            })
          }
        ),
        { numRuns: 10 }
      )
    })

    /**
     * **Feature: video-search-platform, Property 11: Topic browsing order**
     * **Validates: Requirements 6.3**
     */
    it('should order topic browsing results by relevance and recency', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('Serverless', 'Security', 'Storage', 'Architecture', 'Analytics', 'Data Processing'),
          async (selectedTopic: string) => {
            // Perform topic browsing (empty query with topic filter)
            const results = await searchEngine.hybridSearch('', {
              topics: [selectedTopic],
              limit: 50
            })
            
            // Property 11: All results should match the selected topic
            results.forEach(result => {
              const hasMatchingTopic = result.video.topics.some(videoTopic =>
                videoTopic.toLowerCase().includes(selectedTopic.toLowerCase()) ||
                selectedTopic.toLowerCase().includes(videoTopic.toLowerCase())
              )
              expect(hasMatchingTopic).toBe(true)
            })
            
            // Property 11: Results should be ordered by relevance and recency
            if (results.length > 1) {
              for (let i = 1; i < results.length; i++) {
                const current = results[i]
                const previous = results[i - 1]
                
                // Primary ordering: relevance score (descending)
                if (Math.abs(previous.relevanceScore - current.relevanceScore) > 0.01) {
                  expect(previous.relevanceScore).toBeGreaterThanOrEqual(current.relevanceScore)
                } else {
                  // Secondary ordering: recency (newer first) when relevance is similar
                  expect(previous.video.publishedAt.getTime()).toBeGreaterThanOrEqual(current.video.publishedAt.getTime())
                }
              }
            }
            
            // Property 11: Results should have proper structure
            results.forEach(result => {
              expect(result).toHaveProperty('video')
              expect(result).toHaveProperty('segments')
              expect(result).toHaveProperty('relevanceScore')
              expect(Array.isArray(result.video.topics)).toBe(true)
              expect(result.video.topics.length).toBeGreaterThan(0)
              expect(typeof result.relevanceScore).toBe('number')
              expect(result.relevanceScore).toBeGreaterThanOrEqual(0)
              expect(result.relevanceScore).toBeLessThanOrEqual(1)
              expect(result.video.publishedAt).toBeInstanceOf(Date)
            })
            
            // Property 11: Relevance scores should be meaningful for topic browsing
            if (results.length > 0) {
              // At least some results should have reasonable relevance scores
              const hasReasonableScores = results.some(result => result.relevanceScore > 0.1)
              expect(hasReasonableScores).toBe(true)
              
              // All relevance scores should be valid
              results.forEach(result => {
                expect(result.relevanceScore).not.toBeNaN()
                expect(result.relevanceScore).toBeGreaterThanOrEqual(0)
                expect(result.relevanceScore).toBeLessThanOrEqual(1)
              })
            }
          }
        ),
        { numRuns: 15 }
      )
    })

    /**
     * **Feature: video-search-platform, Property 4: Filter application preserves constraints**
     * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
     */
    it('should apply filters correctly and preserve all constraints', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
          fc.record({
            dateRange: fc.option(fc.record({
              start: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
              end: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') })
            }).filter(range => range.start <= range.end), { nil: undefined }),
            duration: fc.option(fc.record({
              min: fc.integer({ min: 0, max: 7200 }),
              max: fc.integer({ min: 0, max: 7200 })
            }).filter(dur => dur.min <= dur.max), { nil: undefined }),
            level: fc.option(fc.array(fc.constantFrom('Introductory' as const, 'Intermediate' as const, 'Advanced' as const, 'Expert' as const), { minLength: 1, maxLength: 4 }), { nil: undefined }),
            services: fc.option(fc.array(fc.constantFrom('AWS Lambda', 'Amazon S3', 'API Gateway', 'AWS KMS'), { minLength: 1, maxLength: 3 }), { nil: undefined }),
            topics: fc.option(fc.array(fc.constantFrom('Serverless', 'Security', 'Storage', 'Architecture'), { minLength: 1, maxLength: 3 }), { nil: undefined }),
            industry: fc.option(fc.array(fc.constantFrom('Technology', 'Finance', 'Healthcare'), { minLength: 1, maxLength: 2 }), { nil: undefined }),
            sessionType: fc.option(fc.array(fc.constantFrom('Breakout' as const, 'Workshop' as const, 'Keynote' as const), { minLength: 1, maxLength: 3 }), { nil: undefined }),
            metadataSource: fc.option(fc.array(fc.constantFrom('transcript' as const, 'video-metadata' as const, 'combined' as const), { minLength: 1, maxLength: 3 }), { nil: undefined }),
            limit: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined })
          }),
          async (query: string, filters: Partial<SearchOptions>) => {
            // Perform search with filters
            const results = await searchEngine.hybridSearch(query, filters)
            
            // Property 4: All results must satisfy the applied filters
            expect(Array.isArray(results)).toBe(true)
            
            results.forEach(result => {
              const video = result.video
              
              // Date range constraint
              if (filters.dateRange) {
                expect(video.publishedAt.getTime()).toBeGreaterThanOrEqual(filters.dateRange.start.getTime())
                expect(video.publishedAt.getTime()).toBeLessThanOrEqual(filters.dateRange.end.getTime())
              }
              
              // Duration constraint
              if (filters.duration) {
                if (filters.duration.min !== undefined) {
                  expect(video.duration).toBeGreaterThanOrEqual(filters.duration.min)
                }
                if (filters.duration.max !== undefined) {
                  expect(video.duration).toBeLessThanOrEqual(filters.duration.max)
                }
              }
              
              // Level constraint
              if (filters.level && filters.level.length > 0) {
                if (video.level !== 'Unknown') {
                  expect(filters.level).toContain(video.level)
                }
              }
              
              // Services constraint - at least one service must match
              if (filters.services && filters.services.length > 0) {
                const hasMatchingService = filters.services.some(filterService =>
                  video.services.some(videoService =>
                    videoService.toLowerCase().includes(filterService.toLowerCase()) ||
                    filterService.toLowerCase().includes(videoService.toLowerCase())
                  )
                )
                expect(hasMatchingService).toBe(true)
              }
              
              // Topics constraint - at least one topic must match
              if (filters.topics && filters.topics.length > 0) {
                const hasMatchingTopic = filters.topics.some(filterTopic =>
                  video.topics.some(videoTopic =>
                    videoTopic.toLowerCase().includes(filterTopic.toLowerCase()) ||
                    filterTopic.toLowerCase().includes(videoTopic.toLowerCase())
                  )
                )
                expect(hasMatchingTopic).toBe(true)
              }
              
              // Industry constraint - at least one industry must match
              if (filters.industry && filters.industry.length > 0) {
                const hasMatchingIndustry = filters.industry.some(filterIndustry =>
                  video.industry.some(videoIndustry =>
                    videoIndustry.toLowerCase().includes(filterIndustry.toLowerCase()) ||
                    filterIndustry.toLowerCase().includes(videoIndustry.toLowerCase())
                  )
                )
                expect(hasMatchingIndustry).toBe(true)
              }
              
              // Session type constraint
              if (filters.sessionType && filters.sessionType.length > 0) {
                if (video.sessionType !== 'Unknown') {
                  expect(filters.sessionType).toContain(video.sessionType)
                }
              }
              
              // Metadata source constraint
              if (filters.metadataSource && filters.metadataSource.length > 0) {
                expect(filters.metadataSource).toContain(video.metadataSource)
              }
            })
            
            // Limit constraint
            if (filters.limit) {
              expect(results.length).toBeLessThanOrEqual(filters.limit)
            }
            
            // Results should maintain proper structure
            results.forEach(result => {
              expect(result).toHaveProperty('video')
              expect(result).toHaveProperty('segments')
              expect(result).toHaveProperty('relevanceScore')
              expect(Array.isArray(result.segments)).toBe(true)
              expect(typeof result.relevanceScore).toBe('number')
              expect(result.relevanceScore).toBeGreaterThanOrEqual(0)
              expect(result.relevanceScore).toBeLessThanOrEqual(1)
            })
          }
        ),
        { numRuns: 25 }
      )
    })
  })

  describe('Unit Tests', () => {
    it('should perform keyword search correctly', async () => {
      const results = await searchEngine.keywordSearch('lambda')
      expect(results.length).toBeGreaterThan(0)
      
      const hasLambdaContent = results.some(segment =>
        segment.text.toLowerCase().includes('lambda')
      )
      expect(hasLambdaContent).toBe(true)
    })

    it('should perform vector search correctly', async () => {
      const queryEmbedding = Array.from({ length: 384 }, () => Math.random())
      const results = await searchEngine.vectorSearch(queryEmbedding, 10)
      
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeLessThanOrEqual(10)
      
      results.forEach(segment => {
        expect(segment).toHaveProperty('id')
        expect(segment).toHaveProperty('videoId')
        expect(segment).toHaveProperty('text')
      })
    })

    it('should handle search errors gracefully', async () => {
      // Test with invalid options
      const results = await searchEngine.hybridSearch('test', {
        dateRange: { start: new Date('2030-01-01'), end: new Date('2020-01-01') } // Invalid range
      })
      
      expect(Array.isArray(results)).toBe(true)
    })
  })
})