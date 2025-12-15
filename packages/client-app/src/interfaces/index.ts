/**
 * Client-side service interfaces
 * Simplified version: keyword search only, no segments/embeddings
 */

import type {
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
  search(query: string, options: SearchOptions): Promise<SearchResult[]>
  getAvailableFilters(): {
    levels: string[]
    services: string[]
    topics: string[]
    sessionTypes: string[]
    channels: string[]
  }
  getFilterStatistics(): {
    totalVideos: number
    levelCounts: Record<string, number>
    serviceCounts: Record<string, number>
    topicCounts: Record<string, number>
    sessionTypeCounts: Record<string, number>
  }
}

// User interface component interface
export interface UserInterface {
  renderSearchBar(): JSX.Element
  renderFilters(): JSX.Element
  renderResults(results: SearchResult[]): JSX.Element
}
