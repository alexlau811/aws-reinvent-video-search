/**
 * Shared type definitions for the AWS re:Invent Video Search Platform
 * Used by both data pipeline and client application
 */

// Core video metadata interface
export interface VideoMetadata {
  id: string
  title: string
  description: string
  channelId: string
  channelTitle: string
  publishedAt: Date
  duration: number
  thumbnailUrl: string
  youtubeUrl: string
  
  // Enriched metadata
  level: 'Introductory' | 'Intermediate' | 'Advanced' | 'Expert' | 'Unknown'
  services: string[]
  topics: string[]
  industry: string[]
  sessionType: 'Breakout' | 'Chalk Talk' | 'Workshop' | 'Keynote' | 'Lightning Talk' | 'Unknown'
  speakers: string[]
  
  // Metadata source tracking
  metadataSource: 'official' | 'transcript' | 'hybrid'
  metadataConfidence: number
  extractedKeywords: string[]
}

// Video segment with transcript and embedding data
export interface VideoSegment {
  id: string
  videoId: string
  startTime: number
  endTime: number
  text: string
  embedding: number[]
  confidence?: number
  speaker?: string
}

// Transcript data structures
export interface Transcript {
  videoId: string
  language: string
  confidence: number
  segments: TranscriptSegment[]
}

export interface TranscriptSegment {
  startTime: number
  endTime: number
  text: string
  confidence: number
  speaker?: string
}

// Metadata enrichment interfaces
export interface OfficialMetadata {
  level: 'Introductory' | 'Intermediate' | 'Advanced' | 'Expert'
  services: string[]
  topics: string[]
  industry: string[]
  sessionType: 'Breakout' | 'Chalk Talk' | 'Workshop' | 'Keynote' | 'Lightning Talk'
  speakers: string[]
  officialDescription?: string
}

export interface ExtractedMetadata {
  inferredServices: string[]
  inferredTopics: string[]
  inferredLevel: string
  keyTerms: string[]
  confidence: number
}

export interface EnrichedMetadata extends OfficialMetadata {
  dataSource: 'official' | 'transcript' | 'hybrid'
  confidence: number
  extractedKeywords: string[]
}

// Search-related interfaces
export interface SearchOptions {
  dateRange?: { start: Date; end: Date }
  channels?: string[]
  duration?: { min: number; max: number }
  level?: ('Introductory' | 'Intermediate' | 'Advanced' | 'Expert')[]
  services?: string[]
  topics?: string[]
  industry?: string[]
  sessionType?: ('Breakout' | 'Chalk Talk' | 'Workshop' | 'Keynote' | 'Lightning Talk')[]
  metadataSource?: ('official' | 'transcript' | 'hybrid')[]
  limit?: number
}

export interface SearchResult {
  video: VideoMetadata
  segments: VideoSegment[]
  relevanceScore: number
}

// Database interfaces
export interface Database {
  prepare(sql: string): Statement
  exec(sql: string): void
  close(): void
}

export interface Statement {
  run(...params: any[]): { changes: number; lastInsertRowid: number }
  get(...params: any[]): any
  all(...params: any[]): any[]
  finalize(): void
}

// Error types
export class VideoProcessingError extends Error {
  constructor(
    message: string,
    public videoId: string,
    public stage: 'discovery' | 'transcription' | 'embedding' | 'database',
    public originalError?: Error
  ) {
    super(message)
    this.name = 'VideoProcessingError'
  }
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    public operation: string,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class SearchError extends Error {
  constructor(
    message: string,
    public query: string,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'SearchError'
  }
}