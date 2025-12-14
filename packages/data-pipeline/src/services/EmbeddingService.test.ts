/**
 * Tests for EmbeddingService
 * **Feature: video-search-platform, Property 6: Video processing pipeline completeness**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EmbeddingServiceImpl } from './EmbeddingService.js'
import { VideoProcessingError } from '@aws-reinvent-search/shared'

// Mock the send method
const mockSend = vi.fn()

// Mock AWS SDK
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
    send: mockSend
  })),
  InvokeModelCommand: vi.fn()
}))

describe('EmbeddingService', () => {
  let embeddingService: EmbeddingServiceImpl

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    mockSend.mockReset()
    
    // Create service instance
    embeddingService = new EmbeddingServiceImpl('us-east-1')
  })

  describe('generateEmbeddings', () => {
    it('should generate embeddings for valid text', async () => {
      // Mock successful response
      const mockEmbedding = new Array(1024).fill(0).map(() => Math.random())
      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          embedding: mockEmbedding
        }))
      })

      const result = await embeddingService.generateEmbeddings('Test text for embedding')
      
      expect(result).toEqual(mockEmbedding)
      expect(mockSend).toHaveBeenCalledTimes(1)
    })

    it('should throw error for empty text', async () => {
      await expect(embeddingService.generateEmbeddings('')).rejects.toThrow(VideoProcessingError)
      await expect(embeddingService.generateEmbeddings('   ')).rejects.toThrow(VideoProcessingError)
    })

    it('should handle API errors gracefully', async () => {
      mockSend.mockRejectedValue(new Error('API Error'))

      await expect(embeddingService.generateEmbeddings('Test text')).rejects.toThrow(VideoProcessingError)
    })

    it('should truncate long text appropriately', async () => {
      const longText = 'A'.repeat(50000) // Very long text
      const mockEmbedding = new Array(1024).fill(0).map(() => Math.random())
      
      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          embedding: mockEmbedding
        }))
      })

      const result = await embeddingService.generateEmbeddings(longText)
      expect(result).toEqual(mockEmbedding)
    })
  })

  describe('batchGenerateEmbeddings', () => {
    it('should process multiple texts', async () => {
      const texts = ['Text 1', 'Text 2', 'Text 3']
      const mockEmbedding = new Array(1024).fill(0).map(() => Math.random())
      
      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          embedding: mockEmbedding
        }))
      })

      const results = await embeddingService.batchGenerateEmbeddings(texts)
      
      expect(results).toHaveLength(3)
      expect(results[0]).toEqual(mockEmbedding)
      expect(mockSend).toHaveBeenCalledTimes(3)
    })

    it('should return empty array for empty input', async () => {
      const results = await embeddingService.batchGenerateEmbeddings([])
      expect(results).toEqual([])
    })

    it('should handle partial failures gracefully', async () => {
      const texts = ['Text 1', 'Text 2']
      const mockEmbedding = new Array(1024).fill(0).map(() => Math.random())
      
      // First call succeeds, second fails
      mockSend
        .mockResolvedValueOnce({
          body: new TextEncoder().encode(JSON.stringify({
            embedding: mockEmbedding
          }))
        })
        .mockRejectedValueOnce(new Error('API Error'))

      const results = await embeddingService.batchGenerateEmbeddings(texts)
      
      expect(results).toHaveLength(2)
      expect(results[0]).toEqual(mockEmbedding)
      expect(results[1]).toEqual(new Array(1024).fill(0)) // Fallback zero vector
    })
  })

  describe('validateEmbedding', () => {
    it('should validate correct embeddings', () => {
      const validEmbedding = new Array(1024).fill(0).map(() => Math.random())
      expect(embeddingService.validateEmbedding(validEmbedding)).toBe(true)
    })

    it('should reject invalid embeddings', () => {
      expect(embeddingService.validateEmbedding([])).toBe(false)
      expect(embeddingService.validateEmbedding(new Array(512).fill(0))).toBe(false)
      expect(embeddingService.validateEmbedding(new Array(1024).fill(NaN))).toBe(false)
    })
  })

  describe('cosineSimilarity', () => {
    it('should calculate similarity correctly', () => {
      const a = [1, 0, 0]
      const b = [1, 0, 0]
      const c = [0, 1, 0]
      
      expect(embeddingService.cosineSimilarity(a, b)).toBeCloseTo(1.0)
      expect(embeddingService.cosineSimilarity(a, c)).toBeCloseTo(0.0)
    })

    it('should throw error for mismatched dimensions', () => {
      const a = [1, 0]
      const b = [1, 0, 0]
      
      expect(() => embeddingService.cosineSimilarity(a, b)).toThrow()
    })
  })
})