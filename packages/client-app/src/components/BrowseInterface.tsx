import React, { useState, useEffect } from 'react'
import type { Database, SearchResult } from '@aws-reinvent-search/shared'
import { SearchEngine } from '../services'

interface BrowseInterfaceProps {
  database: Database
}

interface CategoryData {
  name: string
  count: number
  subcategories?: CategoryData[]
}

interface BrowseFilters {
  selectedCategory?: string
  selectedTopic?: string
  selectedLevel?: string
  selectedSessionType?: string
  selectedService?: string
}

export const BrowseInterface: React.FC<BrowseInterfaceProps> = ({ database }) => {
  const [activeTab, setActiveTab] = useState<'categories' | 'topics' | 'services'>('categories')
  const [filters, setFilters] = useState<BrowseFilters>({})
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  
  // Available filter data
  const [availableFilters, setAvailableFilters] = useState({
    levels: [] as string[],
    services: [] as string[],
    topics: [] as string[],
    industries: [] as string[],
    sessionTypes: [] as string[],
    channels: [] as string[]
  })
  
  // Filter statistics for counts
  const [filterStats, setFilterStats] = useState({
    totalVideos: 0,
    levelCounts: {} as Record<string, number>,
    serviceCounts: {} as Record<string, number>,
    topicCounts: {} as Record<string, number>,
    industryCounts: {} as Record<string, number>,
    sessionTypeCounts: {} as Record<string, number>,
    channelCounts: {} as Record<string, number>
  })

  const searchEngine = new SearchEngine(database)

  // Load available filters and statistics on component mount
  useEffect(() => {
    const loadFilterData = async () => {
      try {
        const filters = searchEngine.getAvailableFilters()
        const stats = searchEngine.getFilterStatistics()
        
        setAvailableFilters(filters)
        setFilterStats(stats)
      } catch (err) {
        console.error('Failed to load filter data:', err)
        setError('Failed to load browsing data')
      }
    }

    loadFilterData()
  }, [database])

  // URL synchronization for browse filters
  useEffect(() => {
    const updateURL = () => {
      const params = new URLSearchParams()
      
      params.set('tab', activeTab)
      if (filters.selectedCategory) params.set('category', filters.selectedCategory)
      if (filters.selectedTopic) params.set('topic', filters.selectedTopic)
      if (filters.selectedService) params.set('service', filters.selectedService)
      if (filters.selectedLevel) params.set('level', filters.selectedLevel)
      if (filters.selectedSessionType) params.set('sessionType', filters.selectedSessionType)
      
      const newURL = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
      window.history.replaceState({}, '', newURL)
    }

    updateURL()
  }, [activeTab, filters])

  // Load filters from URL on component mount
  useEffect(() => {
    const loadFiltersFromURL = () => {
      const params = new URLSearchParams(window.location.search)
      const urlFilters: BrowseFilters = {}
      
      const tabParam = params.get('tab')
      if (tabParam && ['categories', 'topics', 'services'].includes(tabParam)) {
        setActiveTab(tabParam as 'categories' | 'topics' | 'services')
      }
      
      const categoryParam = params.get('category')
      if (categoryParam) urlFilters.selectedCategory = categoryParam
      
      const topicParam = params.get('topic')
      if (topicParam) urlFilters.selectedTopic = topicParam
      
      const serviceParam = params.get('service')
      if (serviceParam) urlFilters.selectedService = serviceParam
      
      const levelParam = params.get('level')
      if (levelParam) urlFilters.selectedLevel = levelParam
      
      const sessionTypeParam = params.get('sessionType')
      if (sessionTypeParam) urlFilters.selectedSessionType = sessionTypeParam
      
      if (Object.keys(urlFilters).length > 0) {
        setFilters(urlFilters)
      }
    }

    loadFiltersFromURL()
  }, [])

  // Load results when filters change
  useEffect(() => {
    const loadResults = async () => {
      setLoading(true)
      setError(null)

      try {
        // Convert browse filters to search options
        const searchOptions = {
          level: filters.selectedLevel ? [filters.selectedLevel as any] : undefined,
          services: filters.selectedService ? [filters.selectedService] : undefined,
          topics: filters.selectedTopic ? [filters.selectedTopic] : undefined,
          industry: filters.selectedCategory ? [filters.selectedCategory] : undefined,
          sessionType: filters.selectedSessionType ? [filters.selectedSessionType as any] : undefined,
          limit: 100
        }

        // Perform search with empty query to get all results matching filters
        const searchResults = await searchEngine.hybridSearch('', searchOptions)
        
        // Sort by relevance and recency for topic browsing
        const sortedResults = searchResults.sort((a, b) => {
          // Primary sort by relevance score
          if (Math.abs(a.relevanceScore - b.relevanceScore) > 0.01) {
            return b.relevanceScore - a.relevanceScore
          }
          // Secondary sort by recency (published date)
          return b.video.publishedAt.getTime() - a.video.publishedAt.getTime()
        })

        setResults(sortedResults)
      } catch (err) {
        console.error('Browse search failed:', err)
        setError(err instanceof Error ? err.message : 'Browse search failed')
      } finally {
        setLoading(false)
      }
    }

    // Only load results if we have at least one filter selected
    if (Object.values(filters).some(value => value)) {
      loadResults()
    } else {
      setResults([])
    }
  }, [filters, searchEngine])

  const handleFilterChange = (filterType: keyof BrowseFilters, value: string | undefined) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }))
  }

  const clearFilters = () => {
    setFilters({})
  }

  // Generate YouTube URL with timestamp
  const generateYouTubeUrl = (videoUrl: string, startTime: number): string => {
    try {
      const url = new URL(videoUrl)
      url.searchParams.set('t', Math.floor(startTime).toString())
      return url.toString()
    } catch (err) {
      console.warn('Failed to generate YouTube URL with timestamp:', err)
      return videoUrl
    }
  }

  // Format time for display
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  // Get category data with counts
  const getCategoryData = (): CategoryData[] => {
    switch (activeTab) {
      case 'categories':
        return availableFilters.industries.map(industry => ({
          name: industry,
          count: filterStats.industryCounts[industry] || 0
        })).sort((a, b) => b.count - a.count)
      
      case 'topics':
        return availableFilters.topics.map(topic => ({
          name: topic,
          count: filterStats.topicCounts[topic] || 0
        })).sort((a, b) => b.count - a.count)
      
      case 'services':
        return availableFilters.services.map(service => ({
          name: service,
          count: filterStats.serviceCounts[service] || 0
        })).sort((a, b) => b.count - a.count)
      
      default:
        return []
    }
  }

  const categoryData = getCategoryData()

  return (
    <div className="space-y-6">
      {/* Browse Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Browse Videos
        </h2>
        <p className="text-gray-600 mb-6">
          Discover AWS re:Invent videos by exploring categories, topics, and services.
        </p>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'categories', label: 'Industries', count: availableFilters.industries.length },
              { key: 'topics', label: 'Topics', count: availableFilters.topics.length },
              { key: 'services', label: 'AWS Services', count: availableFilters.services.length }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filter Sidebar */}
        <div className={`lg:col-span-1 ${showMobileFilters ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-white shadow rounded-lg p-6 space-y-6 sticky top-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Filters</h3>
              <div className="flex items-center space-x-2">
                {Object.values(filters).some(value => value) && (
                  <button
                    onClick={clearFilters}
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="lg:hidden text-gray-400 hover:text-gray-500"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Category/Topic/Service Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {activeTab === 'categories' ? 'Industry' : 
                 activeTab === 'topics' ? 'Topic' : 'AWS Service'}
              </label>
              <select
                value={
                  activeTab === 'categories' ? filters.selectedCategory || '' :
                  activeTab === 'topics' ? filters.selectedTopic || '' :
                  filters.selectedService || ''
                }
                onChange={(e) => {
                  const value = e.target.value || undefined
                  if (activeTab === 'categories') {
                    handleFilterChange('selectedCategory', value)
                  } else if (activeTab === 'topics') {
                    handleFilterChange('selectedTopic', value)
                  } else {
                    handleFilterChange('selectedService', value)
                  }
                }}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="">All {activeTab}</option>
                {categoryData.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} ({item.count})
                  </option>
                ))}
              </select>
            </div>

            {/* Level Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Technical Level
              </label>
              <select
                value={filters.selectedLevel || ''}
                onChange={(e) => handleFilterChange('selectedLevel', e.target.value || undefined)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="">All Levels</option>
                {availableFilters.levels.map((level) => (
                  <option key={level} value={level}>
                    {level} ({filterStats.levelCounts[level] || 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Session Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Type
              </label>
              <select
                value={filters.selectedSessionType || ''}
                onChange={(e) => handleFilterChange('selectedSessionType', e.target.value || undefined)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="">All Types</option>
                {availableFilters.sessionTypes.map((type) => (
                  <option key={type} value={type}>
                    {type} ({filterStats.sessionTypeCounts[type] || 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Active Filters Display */}
            {Object.values(filters).some(value => value) && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Active Filters</h4>
                <div className="space-y-1">
                  {filters.selectedCategory && (
                    <div className="flex items-center justify-between bg-blue-50 px-2 py-1 rounded">
                      <span className="text-sm text-blue-800">Industry: {filters.selectedCategory}</span>
                      <button
                        onClick={() => handleFilterChange('selectedCategory', undefined)}
                        className="text-blue-600 hover:text-blue-500"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {filters.selectedTopic && (
                    <div className="flex items-center justify-between bg-green-50 px-2 py-1 rounded">
                      <span className="text-sm text-green-800">Topic: {filters.selectedTopic}</span>
                      <button
                        onClick={() => handleFilterChange('selectedTopic', undefined)}
                        className="text-green-600 hover:text-green-500"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {filters.selectedService && (
                    <div className="flex items-center justify-between bg-purple-50 px-2 py-1 rounded">
                      <span className="text-sm text-purple-800">Service: {filters.selectedService}</span>
                      <button
                        onClick={() => handleFilterChange('selectedService', undefined)}
                        className="text-purple-600 hover:text-purple-500"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {filters.selectedLevel && (
                    <div className="flex items-center justify-between bg-yellow-50 px-2 py-1 rounded">
                      <span className="text-sm text-yellow-800">Level: {filters.selectedLevel}</span>
                      <button
                        onClick={() => handleFilterChange('selectedLevel', undefined)}
                        className="text-yellow-600 hover:text-yellow-500"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {filters.selectedSessionType && (
                    <div className="flex items-center justify-between bg-red-50 px-2 py-1 rounded">
                      <span className="text-sm text-red-800">Type: {filters.selectedSessionType}</span>
                      <button
                        onClick={() => handleFilterChange('selectedSessionType', undefined)}
                        className="text-red-600 hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-3">
          {/* Mobile Filter Toggle */}
          <div className="lg:hidden mb-4">
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.414A1 1 0 013 6.707V4z" />
              </svg>
              Filters {Object.values(filters).some(value => value) && `(${Object.values(filters).filter(v => v).length})`}
            </button>
          </div>

          {/* Category Grid (when no specific category is selected) */}
          {!Object.values(filters).some(value => value) && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Browse by {activeTab === 'categories' ? 'Industry' : 
                          activeTab === 'topics' ? 'Topic' : 'AWS Service'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryData.slice(0, 12).map((item) => (
                  <button
                    key={item.name}
                    onClick={() => {
                      if (activeTab === 'categories') {
                        handleFilterChange('selectedCategory', item.name)
                      } else if (activeTab === 'topics') {
                        handleFilterChange('selectedTopic', item.name)
                      } else {
                        handleFilterChange('selectedService', item.name)
                      }
                    }}
                    className="text-left p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <div className="font-medium text-gray-900 mb-1 truncate">{item.name}</div>
                    <div className="text-sm text-gray-500">{item.count} videos</div>
                  </button>
                ))}
              </div>
              
              {categoryData.length > 12 && (
                <div className="mt-4 text-center">
                  <p className="text-sm text-gray-500">
                    Showing top 12 of {categoryData.length} {activeTab}. Use the filter to see all.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Browse Error</h3>
                  <p className="mt-1 text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="bg-white shadow rounded-lg p-6 text-center">
              <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-gray-600">Loading videos...</p>
            </div>
          )}

          {/* Results */}
          {!loading && results.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Videos ({results.length})
              </h3>
              <div className="space-y-6">
                {results.map((result, index) => (
                  <div key={`${result.video.id}-${index}`} className="border-b border-gray-200 pb-6 last:border-b-0">
                    <div className="flex flex-col sm:flex-row items-start space-y-4 sm:space-y-0 sm:space-x-4">
                      {/* Video Thumbnail */}
                      <div className="flex-shrink-0 w-full sm:w-auto">
                        <img
                          src={result.video.thumbnailUrl}
                          alt={result.video.title}
                          className="w-full sm:w-40 h-32 sm:h-24 object-cover rounded-lg shadow-sm"
                        />
                      </div>
                      
                      {/* Video Information */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1">
                            <h4 className="text-lg font-medium text-gray-900 mb-2">
                              <a
                                href={result.video.youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-blue-600 transition-colors"
                              >
                                {result.video.title}
                              </a>
                            </h4>
                            
                            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-2">
                              <span>{result.video.channelTitle}</span>
                              <span className="hidden sm:inline">•</span>
                              <span>{formatDuration(result.video.duration)}</span>
                              <span className="hidden sm:inline">•</span>
                              <span>{result.video.publishedAt.toLocaleDateString()}</span>
                              {result.video.level !== 'Unknown' && (
                                <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">
                                  {result.video.level}
                                </span>
                              )}
                            </div>
                            
                            {/* Metadata Tags */}
                            <div className="flex flex-wrap gap-2 mb-3">
                              {result.video.services.slice(0, 3).map((service) => (
                                <span
                                  key={service}
                                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                >
                                  {service}
                                </span>
                              ))}
                              {result.video.topics.slice(0, 2).map((topic) => (
                                <span
                                  key={topic}
                                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                                >
                                  {topic}
                                </span>
                              ))}
                              {result.video.sessionType !== 'Unknown' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  {result.video.sessionType}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex-shrink-0 text-left sm:text-right mt-2 sm:mt-0">
                            <div className="text-sm font-medium text-gray-900">
                              {(result.relevanceScore * 100).toFixed(1)}% match
                            </div>
                            <div className="text-xs text-gray-500">
                              {result.segments.length} segment{result.segments.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                        
                        {/* Video Segments */}
                        {result.segments.length > 0 && (
                          <div className="mt-4">
                            <h5 className="text-sm font-medium text-gray-700 mb-3">
                              Relevant Segments:
                            </h5>
                            <div className="space-y-3">
                              {result.segments.slice(0, 3).map((segment) => (
                                <div
                                  key={segment.id}
                                  className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors"
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 font-mono">
                                        {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                                      </span>
                                      {segment.speaker && (
                                        <span className="text-xs text-gray-500">
                                          {segment.speaker}
                                        </span>
                                      )}
                                    </div>
                                    <a
                                      href={generateYouTubeUrl(result.video.youtubeUrl, segment.startTime)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-blue-600 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                    >
                                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                      </svg>
                                      Watch
                                    </a>
                                  </div>
                                  <p className="text-sm text-gray-700 leading-relaxed">
                                    {segment.text.length > 200 
                                      ? `${segment.text.substring(0, 200)}...` 
                                      : segment.text
                                    }
                                  </p>
                                </div>
                              ))}
                              
                              {result.segments.length > 3 && (
                                <div className="text-center">
                                  <button className="text-sm text-blue-600 hover:text-blue-500 font-medium">
                                    Show {result.segments.length - 3} more segments
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {!loading && results.length === 0 && Object.values(filters).some(value => value) && (
            <div className="bg-white shadow rounded-lg p-6 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No videos found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your filters or selecting a different category.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}