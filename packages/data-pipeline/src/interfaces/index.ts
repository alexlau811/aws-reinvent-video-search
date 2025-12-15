/**
 * Data pipeline service interfaces
 */

import type {
  VideoMetadata,
  Transcript,
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

// Metadata enrichment service interface
export interface MetadataEnrichmentService {
  extractFromTranscript(transcript: string): Promise<ExtractedMetadata>
  extractFromVideoMetadata(videoMetadata: any): Promise<ExtractedMetadata>
  combineMetadata(transcriptMeta: ExtractedMetadata, videoMeta: ExtractedMetadata): EnrichedMetadata
}

// Database service interface
export interface DatabaseService {
  updateVideoMetadata(videos: VideoMetadata[]): Promise<void>
  optimizeDatabase(): Promise<void>
  exportToFile(path: string): Promise<void>
}
