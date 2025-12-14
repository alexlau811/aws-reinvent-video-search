/**
 * Client-side service interfaces
 */

import type { 
  VideoSegment, 
  SearchOptions, 
  SearchResult, 
  Database 
} from '@aws-reinvent-search/shared'

// Database loader interface for client-side
export interface DatabaseLoader {
  downloadDatabase(url: string): Promise<ArrayBuffer>
  initializeSQLite(buffer: ArrayBuffer): Promise<Database>
  checkForUpdates(): Promise<boolean>
}

// Search engine interface for client-side
export interface SearchEngine {
  hybridSearch(query: string, options: SearchOptions): Promise<SearchResult[]>
  vectorSearch(embedding: number[], limit: number): Promise<VideoSegment[]>
  keywordSearch(query: string, options: SearchOptions): Promise<VideoSegment[]>
  combineResults(vectorResults: VideoSegment[], keywordResults: VideoSegment[]): SearchResult[]
}

// User interface component interface
export interface UserInterface {
  renderSearchBar(): JSX.Element
  renderFilters(): JSX.Element
  renderResults(results: SearchResult[]): JSX.Element
  renderVideoSegment(segment: VideoSegment): JSX.Element
}