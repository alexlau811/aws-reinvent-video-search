/**
 * Shared type definitions for the AWS re:Invent Video Search Platform
 * Simplified version: keyword/regex extraction only, no embeddings/segments
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
  metadataSource: 'transcript' | 'video-metadata' | 'combined'
  metadataConfidence: number
  extractedKeywords: string[]
}

// Transcript data structures (for extraction, not stored)
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
export interface ExtractedMetadata {
  inferredServices: string[]
  inferredTopics: string[]
  inferredLevel: 'Introductory' | 'Intermediate' | 'Advanced' | 'Expert' | 'Unknown'
  sessionType: 'Breakout' | 'Chalk Talk' | 'Workshop' | 'Keynote' | 'Lightning Talk' | 'Unknown'
  speakers: string[]
  keyTerms: string[]
  confidence: number
}

export interface EnrichedMetadata {
  level: 'Introductory' | 'Intermediate' | 'Advanced' | 'Expert' | 'Unknown'
  services: string[]
  topics: string[]
  industry: string[]
  sessionType: 'Breakout' | 'Chalk Talk' | 'Workshop' | 'Keynote' | 'Lightning Talk' | 'Unknown'
  speakers: string[]
  dataSource: 'transcript' | 'video-metadata' | 'combined'
  confidence: number
  extractedKeywords: string[]
}

// Search-related interfaces
export interface SearchOptions {
  dateRange?: { start: Date; end: Date }
  channels?: string[]
  duration?: { min?: number; max?: number }
  level?: ('Introductory' | 'Intermediate' | 'Advanced' | 'Expert')[]
  services?: string[]
  topics?: string[]
  industry?: string[]
  sessionType?: ('Breakout' | 'Chalk Talk' | 'Workshop' | 'Keynote' | 'Lightning Talk')[]
  metadataSource?: ('transcript' | 'video-metadata' | 'combined')[]
  limit?: number
}

export interface SearchResult {
  video: VideoMetadata
  relevanceScore: number
}

// Database interfaces for SQLite WASM
export interface Database {
  exec(options: { sql: string; bind?: any[]; returnValue?: 'resultRows' | 'saveSql' }): any[]
  close(): void
  deserialize?(data: Uint8Array): void
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
