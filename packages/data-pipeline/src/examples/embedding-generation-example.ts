/**
 * Example demonstrating embedding generation for video segments
 * This shows how to integrate the EmbeddingService into the video processing pipeline
 */

import { EmbeddingServiceImpl } from '../services/EmbeddingService.js'
import type { VideoSegment, Transcript } from '@aws-reinvent-search/shared'

/**
 * Example function that processes a transcript and generates embeddings for segments
 */
async function processTranscriptEmbeddings(transcript: Transcript): Promise<VideoSegment[]> {
  const embeddingService = new EmbeddingServiceImpl()
  const segments: VideoSegment[] = []

  console.log(`Processing transcript for video ${transcript.videoId}`)
  console.log(`Found ${transcript.segments.length} transcript segments`)

  // Convert transcript segments to video segments with text
  const textSegments = transcript.segments.map((segment, index) => ({
    id: `${transcript.videoId}_segment_${index}`,
    videoId: transcript.videoId,
    startTime: segment.startTime,
    endTime: segment.endTime,
    text: segment.text,
    embedding: [] as number[], // Will be filled by embedding service
    confidence: segment.confidence,
    speaker: segment.speaker
  }))

  // Extract text for batch embedding generation
  const texts = textSegments.map(segment => segment.text)
  
  try {
    console.log('Generating embeddings for all segments...')
    const embeddings = await embeddingService.batchGenerateEmbeddings(texts)
    
    // Combine segments with their embeddings
    for (let i = 0; i < textSegments.length; i++) {
      segments.push({
        ...textSegments[i],
        embedding: embeddings[i]
      })
    }

    console.log(`Successfully generated embeddings for ${segments.length} segments`)
    
    // Validate embeddings
    const validEmbeddings = segments.filter(segment => 
      embeddingService.validateEmbedding(segment.embedding)
    )
    
    console.log(`${validEmbeddings.length}/${segments.length} embeddings are valid`)
    
    return segments

  } catch (error) {
    console.error('Failed to generate embeddings:', error)
    throw error
  }
}

/**
 * Example function that demonstrates semantic similarity between segments
 */
async function demonstrateSemanticSimilarity() {
  const embeddingService = new EmbeddingServiceImpl()
  
  // Example texts about AWS services
  const texts = [
    "Amazon S3 is a scalable object storage service",
    "AWS Lambda lets you run code without provisioning servers",
    "Amazon EC2 provides resizable compute capacity in the cloud",
    "S3 offers industry-leading scalability and data availability",
    "Serverless computing with Lambda reduces operational overhead"
  ]

  try {
    console.log('Generating embeddings for similarity comparison...')
    const embeddings = await embeddingService.batchGenerateEmbeddings(texts)
    
    console.log('\nSemantic similarity matrix:')
    console.log('Texts:')
    texts.forEach((text, i) => console.log(`${i}: ${text}`))
    console.log('\nSimilarity scores:')
    
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const similarity = embeddingService.cosineSimilarity(embeddings[i], embeddings[j])
        console.log(`${i} ↔ ${j}: ${similarity.toFixed(3)}`)
      }
    }
    
  } catch (error) {
    console.error('Failed to demonstrate similarity:', error)
  }
}

/**
 * Example function that shows how to handle large batches efficiently
 */
async function processLargeBatch() {
  const embeddingService = new EmbeddingServiceImpl()
  
  // Simulate a large batch of video segments
  const largeBatch = Array.from({ length: 50 }, (_, i) => 
    `This is segment ${i + 1} discussing AWS services and cloud computing concepts. ` +
    `It covers topics like scalability, reliability, and cost optimization in the cloud.`
  )

  console.log(`Processing large batch of ${largeBatch.length} texts...`)
  
  const startTime = Date.now()
  
  try {
    const embeddings = await embeddingService.batchGenerateEmbeddings(largeBatch)
    const endTime = Date.now()
    
    console.log(`Processed ${embeddings.length} embeddings in ${endTime - startTime}ms`)
    console.log(`Average time per embedding: ${(endTime - startTime) / embeddings.length}ms`)
    
    // Validate all embeddings
    const validCount = embeddings.filter(embedding => 
      embeddingService.validateEmbedding(embedding)
    ).length
    
    console.log(`${validCount}/${embeddings.length} embeddings are valid`)
    
  } catch (error) {
    console.error('Failed to process large batch:', error)
  }
}

// Example usage
async function runExamples() {
  console.log('=== Embedding Service Examples ===\n')
  
  // Example 1: Process transcript embeddings
  const exampleTranscript: Transcript = {
    videoId: 'example_video_123',
    language: 'en',
    confidence: 0.95,
    segments: [
      {
        startTime: 0,
        endTime: 30,
        text: "Welcome to this AWS re:Invent session on serverless computing",
        confidence: 0.98
      },
      {
        startTime: 30,
        endTime: 60,
        text: "Today we'll explore AWS Lambda and its integration with other services",
        confidence: 0.96
      },
      {
        startTime: 60,
        endTime: 90,
        text: "Let's start by understanding the benefits of serverless architecture",
        confidence: 0.94
      }
    ]
  }
  
  try {
    console.log('1. Processing transcript embeddings...')
    const segments = await processTranscriptEmbeddings(exampleTranscript)
    console.log(`Generated ${segments.length} video segments with embeddings\n`)
    
    console.log('2. Demonstrating semantic similarity...')
    await demonstrateSemanticSimilarity()
    console.log()
    
    console.log('3. Processing large batch...')
    await processLargeBatch()
    
  } catch (error) {
    console.error('Example failed:', error)
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error)
}

export { processTranscriptEmbeddings, demonstrateSemanticSimilarity, processLargeBatch }