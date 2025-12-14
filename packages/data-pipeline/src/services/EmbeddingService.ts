/**
 * Embedding generation service using AWS Bedrock Nova 2
 * Generates vector embeddings for semantic search capabilities
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import type { EmbeddingService } from '../interfaces/index.js'
import { VideoProcessingError } from '@aws-reinvent-search/shared'

export class EmbeddingServiceImpl implements EmbeddingService {
  private client: BedrockRuntimeClient
  private readonly modelId = 'amazon.nova-embed-text-v1'
  private readonly maxRetries = 3
  private readonly retryDelay = 1000 // 1 second base delay

  constructor(region: string = 'us-east-1') {
    this.client = new BedrockRuntimeClient({ 
      region,
      maxAttempts: this.maxRetries
    })
  }

  /**
   * Generate embeddings for a single text input
   */
  async generateEmbeddings(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new VideoProcessingError(
        'Cannot generate embeddings for empty text',
        'unknown',
        'embedding'
      )
    }

    // Truncate text if too long (Nova Embed has token limits)
    const truncatedText = this.truncateText(text, 8000)

    try {
      const response = await this.invokeEmbeddingModel(truncatedText)
      return response
    } catch (error) {
      throw new VideoProcessingError(
        `Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'unknown',
        'embedding',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * Processes texts sequentially to avoid rate limits
   */
  async batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return []
    }

    const results: number[][] = []
    const batchSize = 5 // Process in small batches to avoid rate limits
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      const batchPromises = batch.map(async (text, index) => {
        try {
          // Add small delay between requests to avoid rate limiting
          if (index > 0) {
            await this.delay(200)
          }
          return await this.generateEmbeddings(text)
        } catch (error) {
          console.warn(`Failed to generate embedding for text ${i + index}:`, error)
          // Return zero vector as fallback
          return new Array(1024).fill(0) // Nova Embed returns 1024-dimensional vectors
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)

      // Add delay between batches
      if (i + batchSize < texts.length) {
        await this.delay(500)
      }
    }

    return results
  }

  /**
   * Invoke the Nova Embed model via Bedrock
   */
  private async invokeEmbeddingModel(text: string): Promise<number[]> {
    const payload = {
      inputText: text,
      embeddingConfig: {
        outputEmbeddingLength: 1024 // Nova Embed supports 256, 512, or 1024 dimensions
      }
    }

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload)
    })

    const response = await this.client.send(command)
    
    if (!response.body) {
      throw new Error('Empty response from Bedrock')
    }

    const responseBody = JSON.parse(new TextDecoder().decode(response.body))
    
    if (!responseBody.embedding || !Array.isArray(responseBody.embedding)) {
      throw new Error('Invalid embedding response format')
    }

    return responseBody.embedding
  }

  /**
   * Truncate text to fit within token limits
   * Rough approximation: 1 token ≈ 4 characters
   */
  private truncateText(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4
    if (text.length <= maxChars) {
      return text
    }

    // Truncate at word boundary to avoid cutting words
    const truncated = text.substring(0, maxChars)
    const lastSpaceIndex = truncated.lastIndexOf(' ')
    
    return lastSpaceIndex > maxChars * 0.8 
      ? truncated.substring(0, lastSpaceIndex)
      : truncated
  }

  /**
   * Simple delay utility for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Validate embedding dimensions
   */
  validateEmbedding(embedding: number[]): boolean {
    return Array.isArray(embedding) && 
           embedding.length === 1024 && 
           embedding.every(val => typeof val === 'number' && !isNaN(val))
  }

  /**
   * Calculate cosine similarity between two embeddings
   * Useful for testing and validation
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimension')
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
    return magnitude === 0 ? 0 : dotProduct / magnitude
  }
}