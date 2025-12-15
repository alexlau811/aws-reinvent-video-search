import type {
  Database,
  SearchOptions,
  SearchResult,
  VideoMetadata
} from '@aws-reinvent-search/shared'

/**
 * SearchEngine provides keyword-based full-text search
 * Simplified version: no vector search, no segments
 */
export class SearchEngine {
  constructor(private database: Database) {}

  /**
   * Search videos using FTS5 full-text search
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      // Handle empty query for browsing - return all videos with filters applied
      if (!query.trim()) {
        return this.browseVideos(options)
      }

      // Perform keyword search
      const results = await this.keywordSearch(query, options)

      // Apply filters to results
      const filteredResults = this.applyFilters(results, options)

      return filteredResults

    } catch (error) {
      console.error('Search failed:', error)
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Browse videos with filters applied (no search query)
   */
  private async browseVideos(options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      let sql = `
        SELECT
          id, title, description, channel_id, channel_title,
          published_at, duration, thumbnail_url, youtube_url,
          level, services, topics, industry, session_type, speakers,
          metadata_source, metadata_confidence, extracted_keywords
        FROM videos
      `

      const params: any[] = []
      const conditions: string[] = []

      // Add filter conditions
      if (options.level && options.level.length > 0) {
        const levelPlaceholders = options.level.map(() => '?').join(',')
        conditions.push(`level IN (${levelPlaceholders})`)
        params.push(...options.level)
      }

      if (options.services && options.services.length > 0) {
        const serviceConditions = options.services.map(() => 'services LIKE ?').join(' OR ')
        conditions.push(`(${serviceConditions})`)
        options.services.forEach(service => params.push(`%"${service}"%`))
      }

      if (options.topics && options.topics.length > 0) {
        const topicConditions = options.topics.map(() => 'topics LIKE ?').join(' OR ')
        conditions.push(`(${topicConditions})`)
        options.topics.forEach(topic => params.push(`%"${topic}"%`))
      }

      if (options.sessionType && options.sessionType.length > 0) {
        const sessionTypePlaceholders = options.sessionType.map(() => '?').join(',')
        conditions.push(`session_type IN (${sessionTypePlaceholders})`)
        params.push(...options.sessionType)
      }

      if (options.dateRange) {
        conditions.push(`published_at BETWEEN ? AND ?`)
        params.push(options.dateRange.start.toISOString(), options.dateRange.end.toISOString())
      }

      if (options.duration) {
        if (options.duration.min !== undefined) {
          conditions.push(`duration >= ?`)
          params.push(options.duration.min)
        }
        if (options.duration.max !== undefined) {
          conditions.push(`duration <= ?`)
          params.push(options.duration.max)
        }
      }

      // Add WHERE clause if we have conditions
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`
      }

      // Order by published date (recency)
      sql += ` ORDER BY published_at DESC`

      // Apply limit
      const limit = options.limit || 100
      sql += ` LIMIT ${limit}`

      const rows = this.database.exec({
        sql: sql,
        bind: params,
        returnValue: 'resultRows'
      })

      return rows.map((row: any[]) => ({
        video: this.mapRowToVideo(row),
        relevanceScore: 0.5 // Base score for browse results
      }))

    } catch (error) {
      console.error('Browse videos failed:', error)
      throw new Error(`Browse failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Perform keyword-based search using FTS5
   */
  private async keywordSearch(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      if (!query.trim()) {
        return []
      }

      // Try FTS search first
      try {
        const ftsQuery = `SELECT rowid FROM videos_fts WHERE videos_fts MATCH ?`
        const ftsResults = this.database.exec({
          sql: ftsQuery,
          bind: [query],
          returnValue: 'resultRows'
        })

        if (ftsResults.length > 0) {
          const rowids = ftsResults.map((r: any[]) => r[0])
          const placeholders = rowids.map(() => '?').join(',')

          const sql = `
            SELECT
              id, title, description, channel_id, channel_title,
              published_at, duration, thumbnail_url, youtube_url,
              level, services, topics, industry, session_type, speakers,
              metadata_source, metadata_confidence, extracted_keywords
            FROM videos
            WHERE rowid IN (${placeholders})
            ORDER BY published_at DESC
            LIMIT ${options.limit || 100}
          `

          const rows = this.database.exec({
            sql: sql,
            bind: rowids,
            returnValue: 'resultRows'
          })

          return rows.map((row: any[], index: number) => ({
            video: this.mapRowToVideo(row),
            relevanceScore: 0.9 - (index * 0.01) // Higher score, decreasing by position
          }))
        }
      } catch (ftsError) {
        console.warn('FTS search not available, falling back to LIKE search')
      }

      // Fallback to LIKE search
      const sql = `
        SELECT
          id, title, description, channel_id, channel_title,
          published_at, duration, thumbnail_url, youtube_url,
          level, services, topics, industry, session_type, speakers,
          metadata_source, metadata_confidence, extracted_keywords
        FROM videos
        WHERE title LIKE ? OR description LIKE ? OR services LIKE ? OR topics LIKE ?
        ORDER BY published_at DESC
        LIMIT ${options.limit || 100}
      `

      const likeQuery = `%${query}%`
      const rows = this.database.exec({
        sql: sql,
        bind: [likeQuery, likeQuery, likeQuery, likeQuery],
        returnValue: 'resultRows'
      })

      return rows.map((row: any[], index: number) => ({
        video: this.mapRowToVideo(row),
        relevanceScore: 0.7 - (index * 0.01) // Lower score for LIKE matches
      }))

    } catch (error) {
      console.error('Keyword search failed:', error)
      throw new Error(`Keyword search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Map database row to VideoMetadata
   */
  private mapRowToVideo(row: any[]): VideoMetadata {
    return {
      id: row[0],
      title: row[1],
      description: row[2],
      channelId: row[3],
      channelTitle: row[4],
      publishedAt: new Date(row[5]),
      duration: row[6],
      thumbnailUrl: row[7],
      youtubeUrl: row[8],
      level: row[9],
      services: row[10] ? JSON.parse(row[10]) : [],
      topics: row[11] ? JSON.parse(row[11]) : [],
      industry: row[12] ? JSON.parse(row[12]) : [],
      sessionType: row[13],
      speakers: row[14] ? JSON.parse(row[14]) : [],
      metadataSource: row[15],
      metadataConfidence: row[16],
      extractedKeywords: row[17] ? JSON.parse(row[17]) : []
    }
  }

  /**
   * Apply filters to search results
   */
  private applyFilters(results: SearchResult[], options: SearchOptions): SearchResult[] {
    let filteredResults = results.filter(result => {
      const video = result.video

      // Date range filter
      if (options.dateRange) {
        const publishedAt = video.publishedAt
        if (publishedAt < options.dateRange.start || publishedAt > options.dateRange.end) {
          return false
        }
      }

      // Channel filter
      if (options.channels && options.channels.length > 0) {
        const matchesChannel = options.channels.some(channel =>
          video.channelId.toLowerCase().includes(channel.toLowerCase()) ||
          video.channelTitle.toLowerCase().includes(channel.toLowerCase())
        )
        if (!matchesChannel) {
          return false
        }
      }

      // Duration filter
      if (options.duration) {
        if (options.duration.min !== undefined && video.duration < options.duration.min) {
          return false
        }
        if (options.duration.max !== undefined && video.duration > options.duration.max) {
          return false
        }
      }

      // Level filter
      if (options.level && options.level.length > 0) {
        if (video.level === 'Unknown') {
          return false
        }
        if (!options.level.includes(video.level as any)) {
          return false
        }
      }

      // Services filter
      if (options.services && options.services.length > 0) {
        const hasMatchingService = options.services.some(filterService =>
          video.services.some(videoService =>
            this.matchesFilter(videoService, filterService)
          )
        )
        if (!hasMatchingService) {
          return false
        }
      }

      // Topics filter
      if (options.topics && options.topics.length > 0) {
        const hasMatchingTopic = options.topics.some(filterTopic =>
          video.topics.some(videoTopic =>
            this.matchesFilter(videoTopic, filterTopic)
          )
        )
        if (!hasMatchingTopic) {
          return false
        }
      }

      // Session type filter
      if (options.sessionType && options.sessionType.length > 0) {
        if (video.sessionType === 'Unknown') {
          return false
        }
        if (!options.sessionType.includes(video.sessionType as any)) {
          return false
        }
      }

      // Metadata source filter
      if (options.metadataSource && options.metadataSource.length > 0) {
        if (!options.metadataSource.includes(video.metadataSource)) {
          return false
        }
      }

      return true
    })

    // Apply limit after all filtering
    if (options.limit && options.limit > 0) {
      filteredResults = filteredResults.slice(0, options.limit)
    }

    return filteredResults
  }

  /**
   * Fuzzy filter matching
   */
  private matchesFilter(videoValue: string, filterValue: string): boolean {
    const videoLower = videoValue.toLowerCase().trim()
    const filterLower = filterValue.toLowerCase().trim()

    if (videoLower === filterLower) return true
    if (videoLower.includes(filterLower) || filterLower.includes(videoLower)) return true

    const videoWords = videoLower.split(/\s+/)
    const filterWords = filterLower.split(/\s+/)

    return filterWords.some(filterWord =>
      videoWords.some(videoWord =>
        videoWord.includes(filterWord) || filterWord.includes(videoWord)
      )
    )
  }

  /**
   * Get available filter values for building filter interfaces
   */
  getAvailableFilters(): {
    levels: string[]
    services: string[]
    topics: string[]
    sessionTypes: string[]
    channels: string[]
  } {
    try {
      const sql = `
        SELECT DISTINCT
          level,
          services,
          topics,
          session_type,
          channel_title
        FROM videos
      `

      const rows = this.database.exec({
        sql: sql,
        returnValue: 'resultRows'
      })

      const filters = {
        levels: new Set<string>(),
        services: new Set<string>(),
        topics: new Set<string>(),
        sessionTypes: new Set<string>(),
        channels: new Set<string>()
      }

      rows.forEach((row: any[]) => {
        if (row[0] && row[0] !== 'Unknown') {
          filters.levels.add(row[0])
        }

        if (row[3] && row[3] !== 'Unknown') {
          filters.sessionTypes.add(row[3])
        }

        if (row[4]) {
          filters.channels.add(row[4])
        }

        // Parse JSON arrays
        try {
          if (row[1]) {
            const services = JSON.parse(row[1])
            services.forEach((service: string) => filters.services.add(service))
          }
        } catch (e) {
          console.warn('Failed to parse services:', e)
        }

        try {
          if (row[2]) {
            const topics = JSON.parse(row[2])
            topics.forEach((topic: string) => filters.topics.add(topic))
          }
        } catch (e) {
          console.warn('Failed to parse topics:', e)
        }
      })

      return {
        levels: Array.from(filters.levels).sort(),
        services: Array.from(filters.services).sort(),
        topics: Array.from(filters.topics).sort(),
        sessionTypes: Array.from(filters.sessionTypes).sort(),
        channels: Array.from(filters.channels).sort()
      }

    } catch (error) {
      console.error('Failed to get available filters:', error)
      return {
        levels: [],
        services: [],
        topics: [],
        sessionTypes: [],
        channels: []
      }
    }
  }

  /**
   * Get filter statistics (counts)
   */
  getFilterStatistics(): {
    totalVideos: number
    levelCounts: Record<string, number>
    serviceCounts: Record<string, number>
    topicCounts: Record<string, number>
    sessionTypeCounts: Record<string, number>
  } {
    try {
      const totalSql = `SELECT COUNT(*) as total FROM videos`
      const totalRows = this.database.exec({
        sql: totalSql,
        returnValue: 'resultRows'
      })
      const totalVideos = totalRows.length > 0 ? totalRows[0][0] : 0

      const sql = `
        SELECT
          level,
          services,
          topics,
          session_type
        FROM videos
      `

      const rows = this.database.exec({
        sql: sql,
        returnValue: 'resultRows'
      })

      const stats = {
        totalVideos,
        levelCounts: {} as Record<string, number>,
        serviceCounts: {} as Record<string, number>,
        topicCounts: {} as Record<string, number>,
        sessionTypeCounts: {} as Record<string, number>
      }

      rows.forEach((row: any[]) => {
        if (row[0] && row[0] !== 'Unknown') {
          stats.levelCounts[row[0]] = (stats.levelCounts[row[0]] || 0) + 1
        }

        if (row[3] && row[3] !== 'Unknown') {
          stats.sessionTypeCounts[row[3]] = (stats.sessionTypeCounts[row[3]] || 0) + 1
        }

        try {
          if (row[1]) {
            const services = JSON.parse(row[1])
            services.forEach((service: string) => {
              stats.serviceCounts[service] = (stats.serviceCounts[service] || 0) + 1
            })
          }
        } catch (e) {
          console.warn('Failed to parse services for stats:', e)
        }

        try {
          if (row[2]) {
            const topics = JSON.parse(row[2])
            topics.forEach((topic: string) => {
              stats.topicCounts[topic] = (stats.topicCounts[topic] || 0) + 1
            })
          }
        } catch (e) {
          console.warn('Failed to parse topics for stats:', e)
        }
      })

      return stats

    } catch (error) {
      console.error('Failed to get filter statistics:', error)
      return {
        totalVideos: 0,
        levelCounts: {},
        serviceCounts: {},
        topicCounts: {},
        sessionTypeCounts: {}
      }
    }
  }
}
