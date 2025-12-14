import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import * as fc from 'fast-check'
import { SearchInterface } from './SearchInterface'
import type { Database } from '@aws-reinvent-search/shared'

// Mock the SearchEngine
const mockHybridSearch = vi.fn()
const mockGetAvailableFilters = vi.fn().mockReturnValue({
  levels: ['Introductory', 'Intermediate', 'Advanced', 'Expert'],
  services: ['Amazon S3', 'AWS Lambda', 'Amazon EC2'],
  topics: ['Machine Learning', 'Serverless', 'Storage'],
  industries: ['Healthcare', 'Financial Services', 'Gaming'],
  sessionTypes: ['Breakout', 'Workshop', 'Keynote'],
  channels: ['AWS Events', 'AWS Online Tech Talks'],
  metadataSources: ['transcript', 'video-metadata', 'combined']
})

vi.mock('../services', () => ({
  SearchEngine: vi.fn().mockImplementation(() => ({
    hybridSearch: mockHybridSearch,
    getAvailableFilters: mockGetAvailableFilters
  }))
}))

// Create a mock database
const createMockDatabase = (): Database => ({
  prepare: vi.fn().mockReturnValue({
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn().mockReturnValue([]),
    finalize: vi.fn()
  }),
  exec: vi.fn(),
  deserialize: vi.fn(),
  close: vi.fn()
})

// Property-based test generators
const videoMetadataArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  title: fc.string({ minLength: 10, maxLength: 100 }),
  description: fc.string({ minLength: 20, maxLength: 500 }),
  channelId: fc.string({ minLength: 1, maxLength: 50 }),
  channelTitle: fc.constantFrom('AWS Events', 'AWS Online Tech Talks', 'Amazon Web Services'),
  publishedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
  duration: fc.integer({ min: 300, max: 7200 }), // 5 minutes to 2 hours
  thumbnailUrl: fc.webUrl(),
  youtubeUrl: fc.webUrl(),
  level: fc.constantFrom('Introductory', 'Intermediate', 'Advanced', 'Expert', 'Unknown'),
  services: fc.array(fc.constantFrom('Amazon S3', 'AWS Lambda', 'Amazon EC2', 'Amazon RDS', 'Amazon DynamoDB'), { maxLength: 5 }),
  topics: fc.array(fc.constantFrom('Machine Learning', 'Serverless', 'Storage', 'Database', 'Security'), { maxLength: 5 }),
  industry: fc.array(fc.constantFrom('Healthcare', 'Financial Services', 'Gaming', 'Retail', 'Manufacturing'), { maxLength: 3 }),
  sessionType: fc.constantFrom('Breakout', 'Chalk Talk', 'Workshop', 'Keynote', 'Lightning Talk', 'Unknown'),
  speakers: fc.array(fc.string({ minLength: 5, maxLength: 30 }), { maxLength: 3 }),
  metadataSource: fc.constantFrom('transcript', 'video-metadata', 'combined'),
  metadataConfidence: fc.float({ min: 0, max: 1 }),
  extractedKeywords: fc.array(fc.string({ minLength: 3, maxLength: 20 }), { maxLength: 10 })
})

const videoSegmentArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  videoId: fc.string({ minLength: 1, maxLength: 20 }),
  startTime: fc.integer({ min: 0, max: 3600 }),
  endTime: fc.integer({ min: 0, max: 3600 }),
  text: fc.string({ minLength: 50, maxLength: 500 }),
  embedding: fc.array(fc.float({ min: -1, max: 1 }), { minLength: 384, maxLength: 384 }),
  confidence: fc.option(fc.float({ min: 0, max: 1 })),
  speaker: fc.option(fc.string({ minLength: 5, maxLength: 30 }))
}).map(segment => ({
  ...segment,
  endTime: Math.max(segment.startTime + 30, segment.endTime) // Ensure endTime > startTime
}))

const searchResultArbitrary = fc.record({
  video: videoMetadataArbitrary,
  segments: fc.array(videoSegmentArbitrary, { minLength: 1, maxLength: 10 }),
  relevanceScore: fc.float({ min: 0, max: 1 })
})

describe('SearchInterface', () => {
  let mockDatabase: Database

  beforeEach(() => {
    mockDatabase = createMockDatabase()
    vi.clearAllMocks()
  })

  describe('Basic Functionality', () => {
    it('renders search form with input and button', () => {
      render(<SearchInterface database={mockDatabase} />)
      
      expect(screen.getByLabelText(/search videos/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/search for aws re:invent videos/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
    })

    it('shows loading state during search', async () => {
      mockHybridSearch.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([]), 100))
      )

      render(<SearchInterface database={mockDatabase} />)
      
      const input = screen.getByPlaceholderText(/search for aws re:invent videos/i)
      const button = screen.getByRole('button', { name: /search/i })
      
      fireEvent.change(input, { target: { value: 'test query' } })
      fireEvent.click(button)
      
      expect(screen.getByText(/searching/i)).toBeInTheDocument()
      
      await waitFor(() => {
        expect(screen.queryByText(/searching/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Property-Based Tests', () => {
    /**
     * **Feature: video-search-platform, Property 2: Search results contain required information**
     * **Validates: Requirements 1.2, 5.1, 5.3**
     */
    it('Property 2: Search results contain required information', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(searchResultArbitrary, { minLength: 1, maxLength: 5 }),
        async (searchResults) => {
          // Mock the search engine to return our generated results
          mockHybridSearch.mockResolvedValue(searchResults)
          
          render(<SearchInterface database={mockDatabase} />)
          
          const input = screen.getByPlaceholderText(/search for aws re:invent videos/i)
          const button = screen.getByRole('button', { name: /search/i })
          
          fireEvent.change(input, { target: { value: 'test query' } })
          fireEvent.click(button)
          
          return waitFor(() => {
            // Check that results are displayed
            expect(screen.getByText(/search results/i)).toBeInTheDocument()
            
            // For each search result, verify required information is present
            searchResults.forEach((result) => {
              // Video title should be present and clickable
              const titleElement = screen.getByText(result.video.title)
              expect(titleElement).toBeInTheDocument()
              expect(titleElement.closest('a')).toHaveAttribute('href', result.video.youtubeUrl)
              
              // Channel title should be present
              expect(screen.getByText(result.video.channelTitle)).toBeInTheDocument()
              
              // Duration should be formatted and displayed
              const durationMinutes = Math.floor(result.video.duration / 60)
              const durationText = durationMinutes > 60 
                ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
                : `${durationMinutes}m`
              expect(screen.getByText(durationText)).toBeInTheDocument()
              
              // Upload date should be displayed
              expect(screen.getByText(result.video.publishedAt.toLocaleDateString())).toBeInTheDocument()
              
              // Relevance score should be displayed
              const relevanceText = `${(result.relevanceScore * 100).toFixed(1)}% match`
              expect(screen.getByText(relevanceText)).toBeInTheDocument()
              
              // Segment count should be displayed
              const segmentCountText = `${result.segments.length} segment${result.segments.length !== 1 ? 's' : ''}`
              expect(screen.getByText(segmentCountText)).toBeInTheDocument()
              
              // Level should be displayed if not Unknown
              if (result.video.level !== 'Unknown') {
                expect(screen.getByText(result.video.level)).toBeInTheDocument()
              }
              
              // Session type should be displayed if not Unknown
              if (result.video.sessionType !== 'Unknown') {
                expect(screen.getByText(result.video.sessionType)).toBeInTheDocument()
              }
              
              // Services should be displayed (up to 3)
              result.video.services.slice(0, 3).forEach(service => {
                expect(screen.getByText(service)).toBeInTheDocument()
              })
              
              // Topics should be displayed (up to 2)
              result.video.topics.slice(0, 2).forEach(topic => {
                expect(screen.getByText(topic)).toBeInTheDocument()
              })
              
              // Segments should be displayed with timestamps and transcript excerpts
              result.segments.slice(0, 5).forEach(segment => {
                // Format timestamps
                const formatTime = (seconds: number) => {
                  const minutes = Math.floor(seconds / 60)
                  const remainingSeconds = Math.floor(seconds % 60)
                  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
                }
                
                const startTimeText = formatTime(segment.startTime)
                const endTimeText = formatTime(segment.endTime)
                
                // Check for timestamp display
                expect(screen.getByText(new RegExp(`${startTimeText}.*${endTimeText}`))).toBeInTheDocument()
                
                // Check for transcript excerpt (truncated if > 200 chars)
                const expectedText = segment.text.length > 200 
                  ? segment.text.substring(0, 200)
                  : segment.text
                expect(screen.getByText(new RegExp(expectedText.substring(0, 50)))).toBeInTheDocument()
                
                // Check for Watch button with YouTube link
                const watchButtons = screen.getAllByText(/watch/i)
                expect(watchButtons.length).toBeGreaterThan(0)
                
                // Verify YouTube URL generation with timestamp
                const expectedUrl = new URL(result.video.youtubeUrl)
                expectedUrl.searchParams.set('t', Math.floor(segment.startTime).toString())
                
                const watchButton = watchButtons.find(button => {
                  const link = button.closest('a')
                  return link && link.getAttribute('href') === expectedUrl.toString()
                })
                expect(watchButton).toBeTruthy()
                
                // Check confidence if present
                if (segment.confidence !== undefined && segment.confidence !== null) {
                  const confidenceText = `${(segment.confidence * 100).toFixed(1)}%`
                  expect(screen.getByText(new RegExp(`confidence.*${confidenceText}`, 'i'))).toBeInTheDocument()
                }
                
                // Check speaker if present
                if (segment.speaker) {
                  expect(screen.getByText(segment.speaker)).toBeInTheDocument()
                }
              })
            })
          })
        }
      ), { numRuns: 10 }) // Reduced runs for UI tests
    })

    it('handles empty search results gracefully', async () => {
      mockHybridSearch.mockResolvedValue([])
      
      render(<SearchInterface database={mockDatabase} />)
      
      const input = screen.getByPlaceholderText(/search for aws re:invent videos/i)
      const button = screen.getByRole('button', { name: /search/i })
      
      fireEvent.change(input, { target: { value: 'nonexistent query' } })
      fireEvent.click(button)
      
      await waitFor(() => {
        expect(screen.getByText(/no results found/i)).toBeInTheDocument()
        expect(screen.getByText(/try adjusting your search terms/i)).toBeInTheDocument()
      })
    })

    it('handles search errors gracefully', async () => {
      mockHybridSearch.mockRejectedValue(new Error('Search service unavailable'))
      
      render(<SearchInterface database={mockDatabase} />)
      
      const input = screen.getByPlaceholderText(/search for aws re:invent videos/i)
      const button = screen.getByRole('button', { name: /search/i })
      
      fireEvent.change(input, { target: { value: 'test query' } })
      fireEvent.click(button)
      
      await waitFor(() => {
        expect(screen.getByText(/search error/i)).toBeInTheDocument()
        expect(screen.getByText(/search service unavailable/i)).toBeInTheDocument()
      })
    })
  })

  describe('Auto-complete Functionality', () => {
    it('shows suggestions when typing', async () => {
      render(<SearchInterface database={mockDatabase} />)
      
      const input = screen.getByPlaceholderText(/search for aws re:invent videos/i)
      
      fireEvent.change(input, { target: { value: 'S3' } })
      fireEvent.focus(input)
      
      await waitFor(() => {
        expect(screen.getByText('Amazon S3')).toBeInTheDocument()
      })
    })

    it('hides suggestions when input is too short', async () => {
      render(<SearchInterface database={mockDatabase} />)
      
      const input = screen.getByPlaceholderText(/search for aws re:invent videos/i)
      
      fireEvent.change(input, { target: { value: 'S' } })
      fireEvent.focus(input)
      
      // Should not show suggestions for single character
      await waitFor(() => {
        expect(screen.queryByText('Amazon S3')).not.toBeInTheDocument()
      })
    })

    it('allows keyboard navigation of suggestions', async () => {
      render(<SearchInterface database={mockDatabase} />)
      
      const input = screen.getByPlaceholderText(/search for aws re:invent videos/i)
      
      fireEvent.change(input, { target: { value: 'AWS' } })
      fireEvent.focus(input)
      
      await waitFor(() => {
        expect(screen.getByText('AWS Lambda')).toBeInTheDocument()
      })
      
      // Test arrow key navigation
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })
      
      await waitFor(() => {
        expect(mockHybridSearch).toHaveBeenCalledWith('AWS Lambda', {})
      })
    })
  })
})