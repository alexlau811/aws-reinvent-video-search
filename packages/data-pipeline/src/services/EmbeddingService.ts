/**
 * Embedding generation service using AWS Bedrock Nova 2 Multimodal Embeddings
 * Generates vector embeddings for semantic search capabilities
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import type { EmbeddingService } from '../interfaces/index.js'
import { VideoProcessingError } from '@aws-reinvent-search/shared'

export class EmbeddingServiceImpl implements EmbeddingService {
  private client: BedrockRuntimeClient
  private readonly modelId = 'amazon.nova-2-multimodal-embeddings-v1:0'
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

    // Truncate text if too long (Nova 2 Multimodal Embeddings has token limits)
    const truncatedText = this.truncateText(text, 8000)

    let lastError: Error | undefined
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.invokeEmbeddingModel(truncatedText)
        return response
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        
        if (attempt < this.maxRetries) {
          // Exponential backoff with jitter
          const delayMs = this.retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000
          await this.delay(delayMs)
        }
      }
    }

    throw new VideoProcessingError(
      `Failed to generate embeddings after ${this.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
      'unknown',
      'embedding',
      lastError
    )
  }

  /**
   * Generate embeddings for query text (optimized for retrieval)
   */
  async generateQueryEmbeddings(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new VideoProcessingError(
        'Cannot generate embeddings for empty query text',
        'unknown',
        'embedding'
      )
    }

    const truncatedText = this.truncateText(text, 8000)

    let lastError: Error | undefined
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.invokeQueryEmbeddingModel(truncatedText)
        return response
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        
        if (attempt < this.maxRetries) {
          const delayMs = this.retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000
          await this.delay(delayMs)
        }
      }
    }

    throw new VideoProcessingError(
      `Failed to generate query embeddings after ${this.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
      'unknown',
      'embedding',
      lastError
    )
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
          return new Array(1024).fill(0) // Nova 2 Multimodal Embeddings returns 1024-dimensional vectors
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
   * Invoke the Nova 2 Multimodal Embeddings model for query text (retrieval optimized)
   */
  private async invokeQueryEmbeddingModel(text: string): Promise<number[]> {
    const payload = {
      schemaVersion: "nova-multimodal-embed-v1",
      taskType: "SINGLE_EMBEDDING",
      singleEmbeddingParams: {
        embeddingPurpose: "TEXT_RETRIEVAL", // For querying text content
        embeddingDimension: 1024,
        text: {
          truncationMode: "END",
          value: text
        }
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
    
    // Nova 2 Multimodal Embeddings returns embeddings in a different format
    if (!responseBody.embeddings || !Array.isArray(responseBody.embeddings) || responseBody.embeddings.length === 0) {
      throw new Error('Invalid embedding response format')
    }

    const firstEmbedding = responseBody.embeddings[0]
    if (!firstEmbedding.embedding || !Array.isArray(firstEmbedding.embedding)) {
      throw new Error('Invalid embedding data format')
    }

    return firstEmbedding.embedding
  }

  /**
   * Invoke the Nova 2 Multimodal Embeddings model for indexing content
   */
  private async invokeEmbeddingModel(text: string): Promise<number[]> {
    const payload = {
      schemaVersion: "nova-multimodal-embed-v1",
      taskType: "SINGLE_EMBEDDING",
      singleEmbeddingParams: {
        embeddingPurpose: "GENERIC_INDEX", // For indexing content in vector database
        embeddingDimension: 1024,
        text: {
          truncationMode: "END", // Truncate from end if text is too long
          value: text
        }
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
    
    // Nova 2 Multimodal Embeddings returns embeddings in a different format
    if (!responseBody.embeddings || !Array.isArray(responseBody.embeddings) || responseBody.embeddings.length === 0) {
      throw new Error('Invalid embedding response format')
    }

    const firstEmbedding = responseBody.embeddings[0]
    if (!firstEmbedding.embedding || !Array.isArray(firstEmbedding.embedding)) {
      throw new Error('Invalid embedding data format')
    }

    return firstEmbedding.embedding
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