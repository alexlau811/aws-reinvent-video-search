/**
 * Example usage of MetadataEnrichmentService
 */

import { MetadataEnrichmentServiceImpl } from '../services/MetadataEnrichmentService.js'

async function demonstrateMetadataEnrichment() {
  const service = new MetadataEnrichmentServiceImpl()
  
  try {
    console.log('🔍 Demonstrating AWS re:Invent Metadata Enrichment Service')
    console.log('=' .repeat(60))
    
    // Example video titles that might be found on YouTube
    const sampleVideoTitles = [
      'AWS re:Invent 2025: ARC123 - Building resilient architectures with AWS',
      'AWS re:Invent 2025: Serverless computing best practices',
      'AWS re:Invent 2025: DOP456 - DevOps at scale with AWS CodePipeline',
      'AWS re:Invent 2025: Machine learning on AWS - Getting started'
    ]
    
    console.log('📋 Sample video titles to process:')
    sampleVideoTitles.forEach((title, index) => {
      console.log(`${index + 1}. ${title}`)
    })
    console.log()
    
    // Demonstrate metadata combination from transcript and video metadata
    console.log('🔧 Demonstrating metadata combination logic:')
    console.log('-'.repeat(50))
    
    // Example: Extract metadata from transcript
    console.log('Example: Extracting metadata from transcript')
    const sampleTranscript = `
      Welcome to this deep dive session on AWS Lambda and serverless architecture.
      We'll cover advanced patterns for building resilient microservices using 
      Amazon API Gateway, DynamoDB, and S3. This session is designed for 
      experienced developers looking to optimize their serverless applications
      for enterprise workloads.
    `
    
    const extractedMetadata = await service.extractFromTranscript(sampleTranscript)
    console.log('✅ Extracted metadata from transcript:')
    console.log(JSON.stringify(extractedMetadata, null, 2))
    console.log()
    
    // Create empty metadata for video source (transcript-only example)
    const emptyVideoMetadata = {
      inferredServices: [],
      inferredTopics: [],
      inferredLevel: 'Unknown' as const,
      sessionType: 'Unknown' as const,
      speakers: [],
      keyTerms: [],
      confidence: 0
    }
    
    const enrichedMetadata = service.combineMetadata(extractedMetadata, emptyVideoMetadata)
    console.log('✅ Enriched metadata (transcript source):')
    console.log(JSON.stringify(enrichedMetadata, null, 2))
    console.log()
    
    // Demonstrate transcript analysis for different video types
    console.log('🔍 Transcript analysis examples:')
    console.log('-'.repeat(40))
    
    const transcriptExamples = [
      {
        title: 'Introductory Session',
        transcript: 'Welcome to this introduction to AWS basics for beginners. We will cover the fundamentals of cloud computing and getting started with AWS services.'
      },
      {
        title: 'Advanced Workshop',
        transcript: 'This hands-on workshop covers advanced architecture patterns and performance optimization techniques for enterprise workloads using Lambda and DynamoDB.'
      }
    ]
    
    for (const example of transcriptExamples) {
      console.log(`\n📝 ${example.title}:`)
      const analysis = await service.extractFromTranscript(example.transcript)
      console.log(`  Level: ${analysis.inferredLevel}`)
      console.log(`  Services: ${analysis.inferredServices.join(', ') || 'None detected'}`)
      console.log(`  Topics: ${analysis.inferredTopics.join(', ') || 'None detected'}`)
      console.log(`  Confidence: ${analysis.confidence.toFixed(2)}`)
    }
    
    console.log('💡 Note: This simplified implementation:')
    console.log('   • Extracts metadata directly from YouTube transcripts')
    console.log('   • Uses pattern matching to identify AWS services and topics')
    console.log('   • Infers technical level from content complexity')
    console.log('   • Can be enhanced with AI/ML for better accuracy')
    console.log('   • Uses both transcript and video metadata for comprehensive analysis')
    
  } catch (error) {
    console.error('❌ Error during demonstration:', error)
  } finally {
    // Clean up browser resources
    await service.cleanup()
    console.log('\n🧹 Cleaned up browser resources')
  }
}

// Run the demonstration
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateMetadataEnrichment()
    .then(() => {
      console.log('\n✨ Demonstration completed successfully!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n💥 Demonstration failed:', error)
      process.exit(1)
    })
}

export { demonstrateMetadataEnrichment }