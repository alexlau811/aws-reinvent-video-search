/**
 * Data pipeline service interfaces
 */

import type { 
  VideoMetadata, 
  Transcript, 
  VideoSegment, 
  ExtractedMetadata, 
  EnrichedMetadata 
} from '@aws-reinvent-search/shared'

// Video discovery service interface
export interface VideoDiscoveryService {
  fetchChannelVideos(channelUrl: string): Promise<VideoMetadata[]>
  filterReInventVideos(videos: VideoMetadata[]): VideoMetadata[]
  identifyNewVideos(videos: VideoMetadata[], existing: VideoMetadata[]): VideoMetadata[]
  extractTranscript(videoId: string): Promise<Transcript | null>
  getTranscriptText(videoId: string): Promise<string | null>
}

// Transcription service interface
export interface TranscriptionService {
  transcribeVideo(videoId: string, audioUrl: string): Promise<Transcript>
  segmentTranscript(transcript: Transcript): VideoSegment[]
}

// Metadata enrichment service interface
export interface MetadataEnrichmentService {
  extractFromTranscript(transcript: string): Promise<ExtractedMetadata>
  extractFromVideoMetadata(videoMetadata: any): Promise<ExtractedMetadata>
  combineMetadata(transcriptMeta: ExtractedMetadata, videoMeta: ExtractedMetadata): EnrichedMetadata
}

// Embedding service interface
export interface EmbeddingService {
  generateEmbeddings(text: string): Promise<number[]>
  generateQueryEmbeddings(text: string): Promise<number[]>
  batchGenerateEmbeddings(texts: string[]): Promise<number[][]>
}

// Database service interface
export interface DatabaseService {
  updateVideoMetadata(videos: VideoMetadata[]): Promise<void>
  insertVideoSegments(segments: VideoSegment[]): Promise<void>
  optimizeDatabase(): Promise<void>
  exportToFile(path: string): Promise<void>
}