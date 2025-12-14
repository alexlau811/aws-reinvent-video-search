/**
 * Data pipeline service interfaces
 */

import type { 
  VideoMetadata, 
  Transcript, 
  VideoSegment, 
  OfficialMetadata, 
  ExtractedMetadata, 
  EnrichedMetadata 
} from '@aws-reinvent-search/shared'

// Video discovery service interface
export interface VideoDiscoveryService {
  fetchChannelVideos(channelUrl: string): Promise<VideoMetadata[]>
  filterReInventVideos(videos: VideoMetadata[]): VideoMetadata[]
  identifyNewVideos(videos: VideoMetadata[], existing: VideoMetadata[]): VideoMetadata[]
}

// Transcription service interface
export interface TranscriptionService {
  transcribeVideo(videoId: string, audioUrl: string): Promise<Transcript>
  segmentTranscript(transcript: Transcript): VideoSegment[]
}

// Metadata enrichment service interface
export interface MetadataEnrichmentService {
  enrichFromAWSOfficial(videoTitle: string): Promise<OfficialMetadata | null>
  extractFromTranscript(transcript: string): Promise<ExtractedMetadata>
  combineMetadata(official: OfficialMetadata | null, extracted: ExtractedMetadata): EnrichedMetadata
}

// Embedding service interface
export interface EmbeddingService {
  generateEmbeddings(text: string): Promise<number[]>
  batchGenerateEmbeddings(texts: string[]): Promise<number[][]>
}

// Database service interface
export interface DatabaseService {
  updateVideoMetadata(videos: VideoMetadata[]): Promise<void>
  insertVideoSegments(segments: VideoSegment[]): Promise<void>
  optimizeDatabase(): Promise<void>
  exportToFile(path: string): Promise<void>
}