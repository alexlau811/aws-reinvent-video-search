import type { 
  Database, 
  SearchOptions, 
  SearchResult, 
  VideoSegment, 
  VideoMetadata 
} from '@aws-reinvent-search/shared'

/**
 * SearchEngine provides hybrid search capabilities combining
 * semantic vector search with keyword-based full-text search
 */
export class SearchEngine {
  constructor(private database: Database) {}

  /**
   * Perform hybrid search combining semantic and keyword matching
   */
  async hybridSearch(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      // Handle empty query for browsing - return all videos with filters applied
      if (!query.trim()) {
        return this.browseVideos(options)
      }

      // Perform both vector and keyword searches
      const keywordResults = await this.keywordSearch(query, options)
      
      // For vector search, we'll use a simple embedding simulation
      // In a real implementation, this would use actual embeddings
      const queryEmbedding = this.generateQueryEmbedding(query)
      const vectorResults = await this.vectorSearch(queryEmbedding, options.limit || 50)
      
      // Combine and rank results
      const combinedResults = this.combineResults(vectorResults, keywordResults)
      
      // Apply filters to the combined results
      const filteredResults = this.applyFilters(combinedResults, options)
      
      return filteredResults
      
    } catch (error) {
      console.error('Hybrid search failed:', error)
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Perform vector-based semantic search using cosine similarity
   */
  async vectorSearch(queryEmbedding: number[], limit: number): Promise<VideoSegment[]> {
    try {
      // Get all segments with embeddings
      const sql = `
        SELECT 
          vs.id,
          vs.video_id,
          vs.start_time,
          vs.end_time,
          vs.text,
          vs.embedding,
          vs.confidence,
          vs.speaker
        FROM video_segments vs
        WHERE vs.embedding IS NOT NULL AND vs.embedding != ''
        LIMIT 1000
      `
      
      const rows = this.database.exec({
        sql: sql,
        returnValue: 'resultRows'
      })
      
      // Calculate similarity scores
      const segmentsWithScores = rows.map((row: any[]) => {
        const embedding = this.deserializeEmbedding(row[5]) // embedding is at index 5
        const similarity = this.cosineSimilarity(queryEmbedding, embedding)
        
        return {
          id: row[0],
          videoId: row[1],
          startTime: row[2],
          endTime: row[3],
          text: row[4],
          embedding: embedding,
          confidence: row[6],
          speaker: row[7],
          similarity: similarity
        }
      })
      
      // Sort by similarity and return top results
      return segmentsWithScores
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(({ similarity, ...segment }: any) => segment)
        
    } catch (error) {
      console.error('Vector search failed:', error)
      // Fallback to empty results if vector search fails
      return []
    }
  }

  /**
   * Browse videos with filters applied (no search query)
   */
  private async browseVideos(options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      // Get all video segments, we'll group them by video later
      let sql = `
        SELECT 
          vs.id,
          vs.video_id,
          vs.start_time,
          vs.end_time,
          vs.text,
          vs.confidence,
          vs.speaker
        FROM video_segments vs
        JOIN videos v ON vs.video_id = v.id
      `

      const params: any[] = []
      const conditions: string[] = []

      // Add filter conditions
      if (options.level && options.level.length > 0) {
        const levelPlaceholders = options.level.map(() => '?').join(',')
        conditions.push(`v.level IN (${levelPlaceholders})`)
        params.push(...options.level)
      }

      if (options.services && options.services.length > 0) {
        const serviceConditions = options.services.map(() => 'v.services LIKE ?').join(' OR ')
        conditions.push(`(${serviceConditions})`)
        options.services.forEach(service => params.push(`%"${service}"%`))
      }

      if (options.topics && options.topics.length > 0) {
        const topicConditions = options.topics.map(() => 'v.topics LIKE ?').join(' OR ')
        conditions.push(`(${topicConditions})`)
        options.topics.forEach(topic => params.push(`%"${topic}"%`))
      }

      if (options.industry && options.industry.length > 0) {
        const industryConditions = options.industry.map(() => 'v.industry LIKE ?').join(' OR ')
        conditions.push(`(${industryConditions})`)
        options.industry.forEach(industry => params.push(`%"${industry}"%`))
      }

      if (options.sessionType && options.sessionType.length > 0) {
        const sessionTypePlaceholders = options.sessionType.map(() => '?').join(',')
        conditions.push(`v.session_type IN (${sessionTypePlaceholders})`)
        params.push(...options.sessionType)
      }

      if (options.dateRange) {
        conditions.push(`v.published_at BETWEEN ? AND ?`)
        params.push(options.dateRange.start.toISOString(), options.dateRange.end.toISOString())
      }

      if (options.duration) {
        if (options.duration.min !== undefined) {
          conditions.push(`v.duration >= ?`)
          params.push(options.duration.min)
        }
        if (options.duration.max !== undefined) {
          conditions.push(`v.duration <= ?`)
          params.push(options.duration.max)
        }
      }

      // Add WHERE clause if we have conditions
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`
      }

      // Order by published date (recency) and confidence
      sql += ` ORDER BY v.published_at DESC, vs.confidence DESC`
      
      // Apply limit
      const limit = options.limit || 100
      sql += ` LIMIT ${limit * 5}` // Get more segments to ensure we have enough videos after grouping

      const rows = this.database.exec({
        sql: sql,
        bind: params,
        returnValue: 'resultRows'
      })

      const segments = rows.map((row: any[]) => ({
        id: row[0],
        videoId: row[1],
        startTime: row[2],
        endTime: row[3],
        text: row[4],
        embedding: [], // Not needed for browsing
        confidence: row[5],
        speaker: row[6]
      }))

      // Group by video and create results
      const results = this.groupSegmentsByVideo(segments)
      
      // Apply final limit to video results
      return results.slice(0, limit)

    } catch (error) {
      console.error('Browse videos failed:', error)
      throw new Error(`Browse failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Perform keyword-based search using FTS5
   */
  async keywordSearch(query: string, _options: SearchOptions = {}): Promise<VideoSegment[]> {
    try {
      // If no query provided, return empty results for keyword search
      if (!query.trim()) {
        return []
      }

      let sql = `
        SELECT 
          vs.id,
          vs.video_id,
          vs.start_time,
          vs.end_time,
          vs.text,
          vs.confidence,
          vs.speaker
        FROM video_segments vs
      `

      const params: any[] = []
      const conditions: string[] = []

      // Add text search condition using FTS5 or fallback to LIKE
      try {
        // Try FTS search first
        const ftsQuery = `SELECT rowid FROM segments_fts WHERE segments_fts MATCH ?`
        const ftsResults = this.database.exec({
          sql: ftsQuery,
          bind: [query],
          returnValue: 'resultRows'
        })
        
        if (ftsResults.length > 0) {
          const rowids = ftsResults.map((r: any[]) => r[0]).join(',')
          conditions.push(`vs.rowid IN (${rowids})`)
        } else {
          // No FTS results found, return empty
          return []
        }
      } catch (ftsError) {
        // FTS not available, use LIKE search as fallback
        console.warn('FTS search not available, using LIKE search')
        conditions.push(`vs.text LIKE ?`)
        params.push(`%${query}%`)
      }

      // Add WHERE clause
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`
      }

      // Add ordering and limit
      sql += ` ORDER BY vs.confidence DESC, vs.start_time ASC`
      sql += ` LIMIT 1000` // Get more results for combination with vector search

      const rows = this.database.exec({
        sql: sql,
        bind: params,
        returnValue: 'resultRows'
      })

      return rows.map((row: any[]) => ({
        id: row[0],
        videoId: row[1],
        startTime: row[2],
        endTime: row[3],
        text: row[4],
        embedding: [], // Will be populated by vector search if needed
        confidence: row[5],
        speaker: row[6]
      }))

    } catch (error) {
      console.error('Keyword search failed:', error)
      throw new Error(`Keyword search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  

  /**
   * Group video segments by video and create search results
   */
  private groupSegmentsByVideo(segments: VideoSegment[]): SearchResult[] {
    const videoMap = new Map<string, { video: VideoMetadata; segments: VideoSegment[] }>()

    // Get video metadata for each segment
    for (const segment of segments) {
      if (!videoMap.has(segment.videoId)) {
        const video = this.getVideoMetadata(segment.videoId)
        if (video) {
          videoMap.set(segment.videoId, { video, segments: [] })
        }
      }
      
      const entry = videoMap.get(segment.videoId)
      if (entry) {
        entry.segments.push(segment)
      }
    }

    // Convert to search results with relevance scores
    return Array.from(videoMap.values()).map(({ video, segments }) => ({
      video,
      segments: segments.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
      relevanceScore: this.calculateRelevanceScore(segments)
    })).sort((a, b) => b.relevanceScore - a.relevanceScore)
  }

  /**
   * Get video metadata by ID
   */
  private getVideoMetadata(videoId: string): VideoMetadata | null {
    try {
      const sql = `
        SELECT 
          id, title, description, channel_id, channel_title,
          published_at, duration, thumbnail_url, youtube_url,
          level, services, topics, industry, session_type, speakers,
          metadata_source, metadata_confidence, extracted_keywords
        FROM videos 
        WHERE id = ?
      `
      
      const rows = this.database.exec({
        sql: sql,
        bind: [videoId],
        returnValue: 'resultRows'
      })
      
      if (rows.length === 0) return null

      const row = rows[0]
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
    } catch (error) {
      console.error('Failed to get video metadata:', error)
      return null
    }
  }

  /**
   * Calculate relevance score based on segment confidence and count
   */
  private calculateRelevanceScore(segments: VideoSegment[]): number {
    if (segments.length === 0) return 0

    const avgConfidence = segments.reduce((sum, seg) => sum + (seg.confidence || 0), 0) / segments.length
    const segmentCountBonus = Math.min(segments.length / 10, 0.2) // Up to 20% bonus for multiple segments
    
    return Math.min(avgConfidence + segmentCountBonus, 1.0)
  }

  /**
   * Combine vector and keyword search results with proper ranking
   */
  combineResults(vectorResults: VideoSegment[], keywordResults: VideoSegment[]): SearchResult[] {
    // Create a map to track all unique segments
    const segmentMap = new Map<string, VideoSegment & { sources: ('vector' | 'keyword')[] }>()
    
    // Add vector results with source tracking
    vectorResults.forEach(segment => {
      const existing = segmentMap.get(segment.id)
      if (existing) {
        existing.sources.push('vector')
      } else {
        segmentMap.set(segment.id, { ...segment, sources: ['vector'] })
      }
    })
    
    // Add keyword results with source tracking
    keywordResults.forEach(segment => {
      const existing = segmentMap.get(segment.id)
      if (existing) {
        existing.sources.push('keyword')
      } else {
        segmentMap.set(segment.id, { ...segment, sources: ['keyword'] })
      }
    })
    
    // Convert to array and boost segments found in both searches
    const allSegments = Array.from(segmentMap.values()).map(segment => {
      const { sources, ...segmentData } = segment
      const hybridBoost = sources.length > 1 ? 0.2 : 0 // 20% boost for segments found in both
      const adjustedConfidence = Math.min((segmentData.confidence || 0) + hybridBoost, 1.0)
      
      return {
        ...segmentData,
        confidence: adjustedConfidence
      }
    })
    
    return this.groupSegmentsByVideo(allSegments)
  }

  /**
   * Apply comprehensive filters to search results using AND logic
   */
  private applyFilters(results: SearchResult[], options: SearchOptions): SearchResult[] {
    let filteredResults = results.filter(result => {
      const video = result.video
      
      // Date range filter - must be within specified range
      if (options.dateRange) {
        const publishedAt = video.publishedAt
        if (publishedAt < options.dateRange.start || publishedAt > options.dateRange.end) {
          return false
        }
      }
      
      // Channel filter - must match one of the specified channels
      if (options.channels && options.channels.length > 0) {
        const matchesChannel = options.channels.some(channel => 
          video.channelId.toLowerCase().includes(channel.toLowerCase()) ||
          video.channelTitle.toLowerCase().includes(channel.toLowerCase())
        )
        if (!matchesChannel) {
          return false
        }
      }
      
      // Duration filter - must be within specified range
      if (options.duration) {
        if (options.duration.min !== undefined && video.duration < options.duration.min) {
          return false
        }
        if (options.duration.max !== undefined && video.duration > options.duration.max) {
          return false
        }
      }
      
      // Level filter - must match one of the specified levels (excluding Unknown)
      if (options.level && options.level.length > 0) {
        if (video.level === 'Unknown') {
          // Include Unknown level videos only if no specific level filter is applied
          return false
        }
        if (!options.level.includes(video.level as any)) {
          return false
        }
      }
      
      // Services filter - must contain at least one matching service
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
      
      // Topics filter - must contain at least one matching topic
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
      
      // Industry filter - must contain at least one matching industry
      if (options.industry && options.industry.length > 0) {
        const hasMatchingIndustry = options.industry.some(filterIndustry => 
          video.industry.some(videoIndustry => 
            this.matchesFilter(videoIndustry, filterIndustry)
          )
        )
        if (!hasMatchingIndustry) {
          return false
        }
      }
      
      // Session type filter - must match one of the specified types (excluding Unknown)
      if (options.sessionType && options.sessionType.length > 0) {
        if (video.sessionType === 'Unknown') {
          return false
        }
        if (!options.sessionType.includes(video.sessionType as any)) {
          return false
        }
      }
      
      // Metadata source filter - must match one of the specified sources
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
   * Enhanced filter matching with fuzzy matching capabilities
   */
  private matchesFilter(videoValue: string, filterValue: string): boolean {
    const videoLower = videoValue.toLowerCase().trim()
    const filterLower = filterValue.toLowerCase().trim()
    
    // Exact match
    if (videoLower === filterLower) {
      return true
    }
    
    // Contains match
    if (videoLower.includes(filterLower) || filterLower.includes(videoLower)) {
      return true
    }
    
    // Word boundary match for better service/topic matching
    const videoWords = videoLower.split(/\s+/)
    const filterWords = filterLower.split(/\s+/)
    
    // Check if any filter words match any video words
    return filterWords.some(filterWord => 
      videoWords.some(videoWord => 
        videoWord.includes(filterWord) || filterWord.includes(videoWord)
      )
    )
  }

  /**
   * Generate a simple query embedding (simulation for now)
   * In a real implementation, this would use the same embedding model as the pipeline
   */
  private generateQueryEmbedding(query: string): number[] {
    // Simple hash-based embedding simulation
    // This creates a consistent but basic representation of the query
    const words = query.toLowerCase().split(/\s+/)
    const embedding = new Array(384).fill(0) // Common embedding dimension
    
    words.forEach((word, index) => {
      const hash = this.simpleHash(word)
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] += Math.sin(hash + i + index) * 0.1
      }
    })
    
    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
    return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding
  }

  /**
   * Simple hash function for string to number conversion
   */
  private simpleHash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0
    
    let dotProduct = 0
    let normA = 0
    let normB = 0
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
    return magnitude > 0 ? dotProduct / magnitude : 0
  }

  /**
   * Deserialize embedding from database storage
   */
  private deserializeEmbedding(embeddingData: any): number[] {
    try {
      if (typeof embeddingData === 'string') {
        return JSON.parse(embeddingData)
      } else if (embeddingData instanceof Uint8Array || embeddingData instanceof ArrayBuffer) {
        // Handle binary storage format
        const view = new Float32Array(embeddingData)
        return Array.from(view)
      } else if (Array.isArray(embeddingData)) {
        return embeddingData
      }
      return []
    } catch (error) {
      console.warn('Failed to deserialize embedding:', error)
      return []
    }
  }

  /**
   * Get available filter values for building filter interfaces
   */
  getAvailableFilters(): {
    levels: string[]
    services: string[]
    topics: string[]
    industries: string[]
    sessionTypes: string[]
    channels: string[]
    metadataSources: string[]
  } {
    try {
      const sql = `
        SELECT DISTINCT 
          level,
          services,
          topics,
          industry,
          session_type,
          channel_title,
          metadata_source
        FROM videos
        WHERE level != 'Unknown' AND session_type != 'Unknown'
      `
      
      const rows = this.database.exec({
        sql: sql,
        returnValue: 'resultRows'
      })
      
      const filters = {
        levels: new Set<string>(),
        services: new Set<string>(),
        topics: new Set<string>(),
        industries: new Set<string>(),
        sessionTypes: new Set<string>(),
        channels: new Set<string>(),
        metadataSources: new Set<string>()
      }
      
      rows.forEach((row: any[]) => {
        if (row[0] && row[0] !== 'Unknown') {
          filters.levels.add(row[0])
        }
        
        if (row[4] && row[4] !== 'Unknown') {
          filters.sessionTypes.add(row[4])
        }
        
        if (row[5]) {
          filters.channels.add(row[5])
        }
        
        if (row[6]) {
          filters.metadataSources.add(row[6])
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
        
        try {
          if (row[3]) {
            const industries = JSON.parse(row[3])
            industries.forEach((industry: string) => filters.industries.add(industry))
          }
        } catch (e) {
          console.warn('Failed to parse industries:', e)
        }
      })
      
      return {
        levels: Array.from(filters.levels).sort(),
        services: Array.from(filters.services).sort(),
        topics: Array.from(filters.topics).sort(),
        industries: Array.from(filters.industries).sort(),
        sessionTypes: Array.from(filters.sessionTypes).sort(),
        channels: Array.from(filters.channels).sort(),
        metadataSources: Array.from(filters.metadataSources).sort()
      }
      
    } catch (error) {
      console.error('Failed to get available filters:', error)
      return {
        levels: [],
        services: [],
        topics: [],
        industries: [],
        sessionTypes: [],
        channels: [],
        metadataSources: []
      }
    }
  }

  /**
   * Get filter statistics (counts) for each filter category
   */
  getFilterStatistics(): {
    totalVideos: number
    levelCounts: Record<string, number>
    serviceCounts: Record<string, number>
    topicCounts: Record<string, number>
    industryCounts: Record<string, number>
    sessionTypeCounts: Record<string, number>
    channelCounts: Record<string, number>
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
          industry,
          session_type,
          channel_title,
          COUNT(*) as count
        FROM videos
        GROUP BY level, services, topics, industry, session_type, channel_title
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
        industryCounts: {} as Record<string, number>,
        sessionTypeCounts: {} as Record<string, number>,
        channelCounts: {} as Record<string, number>
      }
      
      rows.forEach((row: any[]) => {
        const count = row[6] || 0
        
        if (row[0] && row[0] !== 'Unknown') {
          stats.levelCounts[row[0]] = (stats.levelCounts[row[0]] || 0) + count
        }
        
        if (row[4] && row[4] !== 'Unknown') {
          stats.sessionTypeCounts[row[4]] = (stats.sessionTypeCounts[row[4]] || 0) + count
        }
        
        if (row[5]) {
          stats.channelCounts[row[5]] = (stats.channelCounts[row[5]] || 0) + count
        }
        
        // Parse and count JSON arrays
        try {
          if (row[1]) {
            const services = JSON.parse(row[1])
            services.forEach((service: string) => {
              stats.serviceCounts[service] = (stats.serviceCounts[service] || 0) + count
            })
          }
        } catch (e) {
          console.warn('Failed to parse services for stats:', e)
        }
        
        try {
          if (row[2]) {
            const topics = JSON.parse(row[2])
            topics.forEach((topic: string) => {
              stats.topicCounts[topic] = (stats.topicCounts[topic] || 0) + count
            })
          }
        } catch (e) {
          console.warn('Failed to parse topics for stats:', e)
        }
        
        try {
          if (row[3]) {
            const industries = JSON.parse(row[3])
            industries.forEach((industry: string) => {
              stats.industryCounts[industry] = (stats.industryCounts[industry] || 0) + count
            })
          }
        } catch (e) {
          console.warn('Failed to parse industries for stats:', e)
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
        industryCounts: {},
        sessionTypeCounts: {},
        channelCounts: {}
      }
    }
  }
}