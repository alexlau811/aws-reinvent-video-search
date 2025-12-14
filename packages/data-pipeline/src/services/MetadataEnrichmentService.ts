/**
 * MetadataEnrichmentService - Extracts metadata from YouTube video transcripts using AI
 */

import type { 
  ExtractedMetadata, 
  EnrichedMetadata 
} from '@aws-reinvent-search/shared'
import type { MetadataEnrichmentService } from '../interfaces/index.js'

export class MetadataEnrichmentServiceImpl implements MetadataEnrichmentService {
  constructor() {}

  /**
   * Clean up resources (placeholder for interface compatibility)
   */
  async cleanup(): Promise<void> {
    // No cleanup needed for this simplified implementation
  }

  /**
   * Extract metadata from transcript using AI analysis
   * This is a placeholder implementation - in production, this would use AWS Bedrock
   * to analyze the transcript and extract AWS services, topics, and technical level
   */
  async extractFromTranscript(transcript: string): Promise<ExtractedMetadata> {
    // Analyze transcript content for AWS services
    const inferredServices = this.extractAWSServices(transcript)
    
    // Extract topics and themes
    const inferredTopics = this.extractTopics(transcript)
    
    // Infer technical level based on content complexity
    const inferredLevel = this.inferTechnicalLevel(transcript)
    
    // Infer session type from transcript content
    const sessionType = this.inferSessionTypeFromTranscript(transcript)
    
    // Extract speakers from transcript (basic implementation)
    const speakers = this.extractSpeakers(transcript)
    
    // Extract key technical terms
    const keyTerms = this.extractKeyTerms(transcript)
    
    // Calculate confidence based on content analysis
    const confidence = this.calculateConfidence(transcript, inferredServices, inferredTopics)
    
    return {
      inferredServices,
      inferredTopics,
      inferredLevel: this.normalizeLevel(inferredLevel) as ExtractedMetadata['inferredLevel'],
      sessionType: sessionType as ExtractedMetadata['sessionType'],
      speakers,
      keyTerms,
      confidence
    }
  }

  /**
   * Extract metadata from video metadata (title, description, tags) using yt-dlp output
   */
  async extractFromVideoMetadata(videoMetadata: any): Promise<ExtractedMetadata> {
    const title = videoMetadata.title || ''
    const description = videoMetadata.description || ''
    const tags = videoMetadata.tags || []
    
    // Combine all text sources
    const combinedText = `${title} ${description} ${tags.join(' ')}`
    
    // Extract AWS services from metadata
    const inferredServices = this.extractAWSServices(combinedText)
    
    // Extract topics from metadata
    const inferredTopics = this.extractTopics(combinedText)
    
    // Infer level from title and description
    const inferredLevel = this.inferTechnicalLevel(combinedText)
    
    // Infer session type from title and description
    const sessionType = this.inferSessionTypeFromMetadata(title, description)
    
    // Extract speakers from title/description
    const speakers = this.extractSpeakersFromMetadata(title, description)
    
    // Extract key terms
    const keyTerms = this.extractKeyTerms(combinedText)
    
    // Calculate confidence (lower than transcript since less detailed)
    const confidence = Math.min(0.7, this.calculateConfidence(combinedText, inferredServices, inferredTopics))
    
    return {
      inferredServices,
      inferredTopics,
      inferredLevel: this.normalizeLevel(inferredLevel) as ExtractedMetadata['inferredLevel'],
      sessionType: sessionType as ExtractedMetadata['sessionType'],
      speakers,
      keyTerms,
      confidence
    }
  }

  /**
   * Combine metadata from transcript and video metadata sources
   */
  combineMetadata(transcriptMeta: ExtractedMetadata, videoMeta: ExtractedMetadata): EnrichedMetadata {
    // Combine services from both sources, prioritizing transcript
    const combinedServices = [...new Set([...transcriptMeta.inferredServices, ...videoMeta.inferredServices])]
    
    // Combine topics from both sources
    const combinedTopics = [...new Set([...transcriptMeta.inferredTopics, ...videoMeta.inferredTopics])]
    
    // Use transcript level if available, otherwise video metadata level
    const level = transcriptMeta.inferredLevel !== 'Unknown' ? transcriptMeta.inferredLevel : videoMeta.inferredLevel
    
    // Use transcript session type if available, otherwise video metadata
    const sessionType = transcriptMeta.sessionType !== 'Unknown' ? transcriptMeta.sessionType : videoMeta.sessionType
    
    // Combine speakers from both sources
    const combinedSpeakers = [...new Set([...transcriptMeta.speakers, ...videoMeta.speakers])]
    
    // Combine key terms
    const combinedKeywords = [...new Set([...transcriptMeta.keyTerms, ...videoMeta.keyTerms])]
    
    // Use higher confidence score
    const confidence = Math.max(transcriptMeta.confidence, videoMeta.confidence)
    
    // Determine data source
    let dataSource: EnrichedMetadata['dataSource'] = 'combined'
    if (transcriptMeta.confidence === 0 && videoMeta.confidence > 0) {
      dataSource = 'video-metadata'
    } else if (videoMeta.confidence === 0 && transcriptMeta.confidence > 0) {
      dataSource = 'transcript'
    }
    
    return {
      level,
      services: combinedServices,
      topics: combinedTopics,
      industry: [], // Not easily extractable from available sources
      sessionType,
      speakers: combinedSpeakers,
      dataSource,
      confidence,
      extractedKeywords: combinedKeywords
    }
  }

  /**
   * Extract AWS services mentioned in the transcript
   */
  private extractAWSServices(transcript: string): string[] {
    const awsServices = [
      // Compute
      'EC2', 'Lambda', 'ECS', 'EKS', 'Fargate', 'Batch', 'Lightsail',
      // Storage
      'S3', 'EBS', 'EFS', 'FSx', 'Storage Gateway', 'Backup',
      // Database
      'RDS', 'DynamoDB', 'ElastiCache', 'Neptune', 'DocumentDB', 'Redshift', 'Aurora',
      // Networking
      'VPC', 'CloudFront', 'Route 53', 'API Gateway', 'Load Balancer', 'Direct Connect',
      // Security
      'IAM', 'Cognito', 'KMS', 'Secrets Manager', 'Certificate Manager', 'WAF', 'Shield',
      // Analytics
      'Kinesis', 'EMR', 'Glue', 'Athena', 'QuickSight', 'Data Pipeline',
      // AI/ML
      'SageMaker', 'Bedrock', 'Rekognition', 'Comprehend', 'Textract', 'Polly', 'Transcribe',
      // Developer Tools
      'CodeCommit', 'CodeBuild', 'CodeDeploy', 'CodePipeline', 'Cloud9', 'X-Ray',
      // Management
      'CloudWatch', 'CloudTrail', 'Config', 'Systems Manager', 'CloudFormation', 'CDK'
    ]
    
    const foundServices: string[] = []
    const lowerTranscript = transcript.toLowerCase()
    
    for (const service of awsServices) {
      // Look for service name with various patterns
      const patterns = [
        new RegExp(`\\b${service.toLowerCase()}\\b`, 'gi'),
        new RegExp(`\\bamazon\\s+${service.toLowerCase()}\\b`, 'gi'),
        new RegExp(`\\baws\\s+${service.toLowerCase()}\\b`, 'gi')
      ]
      
      for (const pattern of patterns) {
        if (pattern.test(lowerTranscript)) {
          foundServices.push(service)
          break
        }
      }
    }
    
    return [...new Set(foundServices)]
  }

  /**
   * Extract topics and themes from transcript
   */
  private extractTopics(transcript: string): string[] {
    const topicKeywords = {
      'Architecture': ['architecture', 'design', 'pattern', 'microservices', 'serverless', 'distributed'],
      'Security': ['security', 'encryption', 'authentication', 'authorization', 'compliance', 'governance'],
      'DevOps': ['devops', 'ci/cd', 'deployment', 'automation', 'pipeline', 'infrastructure as code'],
      'Machine Learning': ['machine learning', 'ml', 'ai', 'artificial intelligence', 'model', 'training'],
      'Data Analytics': ['analytics', 'data', 'big data', 'etl', 'data lake', 'data warehouse'],
      'Networking': ['network', 'vpc', 'connectivity', 'routing', 'dns', 'load balancing'],
      'Storage': ['storage', 'backup', 'archive', 'file system', 'object storage'],
      'Database': ['database', 'sql', 'nosql', 'relational', 'graph', 'time series'],
      'Monitoring': ['monitoring', 'observability', 'logging', 'metrics', 'alerting', 'tracing'],
      'Cost Optimization': ['cost', 'optimization', 'pricing', 'billing', 'reserved instances']
    }
    
    const foundTopics: string[] = []
    const lowerTranscript = transcript.toLowerCase()
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      for (const keyword of keywords) {
        if (lowerTranscript.includes(keyword)) {
          foundTopics.push(topic)
          break
        }
      }
    }
    
    return [...new Set(foundTopics)]
  }

  /**
   * Infer technical level based on content complexity
   */
  private inferTechnicalLevel(transcript: string): string {
    const lowerTranscript = transcript.toLowerCase()
    
    // Advanced/Expert indicators
    const advancedTerms = [
      'deep dive', 'advanced', 'expert', 'complex', 'sophisticated', 'enterprise',
      'architecture', 'optimization', 'performance tuning', 'troubleshooting',
      'custom implementation', 'advanced configuration'
    ]
    
    // Introductory indicators
    const introTerms = [
      'introduction', 'getting started', 'basics', 'fundamentals', 'overview',
      'beginner', 'first time', 'simple', 'easy', 'quick start'
    ]
    
    // Intermediate indicators
    const intermediateTerms = [
      'best practices', 'implementation', 'use cases', 'practical', 'hands-on',
      'real world', 'case study', 'lessons learned'
    ]
    
    let advancedScore = 0
    let introScore = 0
    let intermediateScore = 0
    
    for (const term of advancedTerms) {
      if (lowerTranscript.includes(term)) advancedScore++
    }
    
    for (const term of introTerms) {
      if (lowerTranscript.includes(term)) introScore++
    }
    
    for (const term of intermediateTerms) {
      if (lowerTranscript.includes(term)) intermediateScore++
    }
    
    // Determine level based on highest score
    if (advancedScore >= 2) return 'Advanced'
    if (introScore >= 2) return 'Introductory'
    if (intermediateScore >= 1) return 'Intermediate'
    
    // Default to intermediate if unclear
    return 'Intermediate'
  }

  /**
   * Extract key technical terms from transcript
   */
  private extractKeyTerms(transcript: string): string[] {
    const technicalTerms = [
      // Cloud concepts
      'cloud', 'hybrid', 'multi-cloud', 'edge', 'serverless', 'containers',
      // Architecture patterns
      'microservices', 'monolith', 'event-driven', 'api-first', 'decoupled',
      // Technologies
      'kubernetes', 'docker', 'terraform', 'ansible', 'jenkins', 'git',
      // Methodologies
      'agile', 'devops', 'cicd', 'infrastructure as code', 'gitops'
    ]
    
    const foundTerms: string[] = []
    const lowerTranscript = transcript.toLowerCase()
    
    for (const term of technicalTerms) {
      if (lowerTranscript.includes(term.toLowerCase())) {
        foundTerms.push(term)
      }
    }
    
    return [...new Set(foundTerms)]
  }

  /**
   * Calculate confidence score based on content analysis
   */
  private calculateConfidence(transcript: string, services: string[], topics: string[]): number {
    let confidence = 0.5 // Base confidence
    
    // Increase confidence based on content richness
    if (services.length > 0) confidence += 0.2
    if (services.length > 2) confidence += 0.1
    if (topics.length > 0) confidence += 0.1
    if (topics.length > 2) confidence += 0.1
    
    // Increase confidence for longer, more detailed transcripts
    const wordCount = transcript.split(/\s+/).length
    if (wordCount > 500) confidence += 0.1
    if (wordCount > 1000) confidence += 0.1
    
    return Math.min(confidence, 1.0)
  }

  /**
   * Normalize level string to valid enum value
   */
  private normalizeLevel(level: string): 'Introductory' | 'Intermediate' | 'Advanced' | 'Expert' | 'Unknown' {
    const normalized = level.toLowerCase().trim()
    
    if (normalized.includes('intro') || normalized.includes('beginner')) {
      return 'Introductory'
    }
    if (normalized.includes('intermediate')) {
      return 'Intermediate'
    }
    if (normalized.includes('advanced')) {
      return 'Advanced'
    }
    if (normalized.includes('expert')) {
      return 'Expert'
    }
    
    return 'Unknown'
  }

  /**
   * Infer session type from transcript content
   */
  private inferSessionTypeFromTranscript(transcript: string): 'Breakout' | 'Chalk Talk' | 'Workshop' | 'Keynote' | 'Lightning Talk' | 'Unknown' {
    const lowerTranscript = transcript.toLowerCase()
    
    if (lowerTranscript.includes('hands-on') || lowerTranscript.includes('workshop') || lowerTranscript.includes('lab')) {
      return 'Workshop'
    }
    if (lowerTranscript.includes('keynote') || lowerTranscript.includes('announcement') || lowerTranscript.includes('opening')) {
      return 'Keynote'
    }
    if (lowerTranscript.includes('lightning') || lowerTranscript.includes('quick talk') || lowerTranscript.includes('5 minute')) {
      return 'Lightning Talk'
    }
    if (lowerTranscript.includes('chalk talk') || lowerTranscript.includes('discussion') || lowerTranscript.includes('q&a')) {
      return 'Chalk Talk'
    }
    
    // Default to Breakout for most technical sessions
    return 'Breakout'
  }

  /**
   * Infer session type from video metadata (title, description)
   */
  private inferSessionTypeFromMetadata(title: string, description: string): 'Breakout' | 'Chalk Talk' | 'Workshop' | 'Keynote' | 'Lightning Talk' | 'Unknown' {
    const combinedText = `${title} ${description}`.toLowerCase()
    
    if (combinedText.includes('workshop') || combinedText.includes('hands-on') || combinedText.includes('lab')) {
      return 'Workshop'
    }
    if (combinedText.includes('keynote') || combinedText.includes('opening') || combinedText.includes('closing')) {
      return 'Keynote'
    }
    if (combinedText.includes('lightning') || combinedText.includes('quick')) {
      return 'Lightning Talk'
    }
    if (combinedText.includes('chalk talk') || combinedText.includes('discussion')) {
      return 'Chalk Talk'
    }
    
    return 'Breakout'
  }

  /**
   * Extract speakers from transcript (basic implementation)
   */
  private extractSpeakers(transcript: string): string[] {
    // This is a basic implementation - in production, this would use more sophisticated NLP
    const speakerPatterns = [
      /speaker[:\s]+([a-z\s]+)/gi,
      /presented by[:\s]+([a-z\s]+)/gi,
      /my name is ([a-z\s]+)/gi,
      /i'm ([a-z\s]+)/gi
    ]
    
    const speakers: string[] = []
    
    for (const pattern of speakerPatterns) {
      const matches = transcript.matchAll(pattern)
      for (const match of matches) {
        if (match[1]) {
          const speaker = match[1].trim()
          if (speaker.length > 2 && speaker.length < 50) {
            speakers.push(speaker)
          }
        }
      }
    }
    
    return [...new Set(speakers)]
  }

  /**
   * Extract speakers from video metadata
   */
  private extractSpeakersFromMetadata(title: string, description: string): string[] {
    const combinedText = `${title} ${description}`
    
    // Look for common patterns in video titles/descriptions
    const speakerPatterns = [
      /with ([A-Z][a-z]+ [A-Z][a-z]+)/g,
      /by ([A-Z][a-z]+ [A-Z][a-z]+)/g,
      /speaker[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/gi,
      /presented by[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/gi
    ]
    
    const speakers: string[] = []
    
    for (const pattern of speakerPatterns) {
      const matches = combinedText.matchAll(pattern)
      for (const match of matches) {
        if (match[1]) {
          const speaker = match[1].trim()
          if (speaker.length > 5 && speaker.length < 50) {
            speakers.push(speaker)
          }
        }
      }
    }
    
    return [...new Set(speakers)]
  }
}