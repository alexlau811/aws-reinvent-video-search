import React, { useState, useEffect, useRef } from 'react'
import type { Database, SearchResult, SearchOptions } from '@aws-reinvent-search/shared'
import { SearchEngine } from '../services'

interface SearchInterfaceProps {
  database: Database
}

interface FilterState {
  dateRange?: { start: Date; end: Date }
  channels?: string[]
  duration?: { min: number; max: number }
  level?: string[]
  services?: string[]
  topics?: string[]
  industry?: string[]
  sessionType?: string[]
  metadataSource?: string[]
}

export const SearchInterface: React.FC<SearchInterfaceProps> = ({ database }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>({})
  
  // Available filter data
  const [availableFilters, setAvailableFilters] = useState({
    levels: [] as string[],
    services: [] as string[],
    topics: [] as string[],
    industries: [] as string[],
    sessionTypes: [] as string[],
    channels: [] as string[],
    metadataSources: [] as string[]
  })
  
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchEngine = new SearchEngine(database)

  // Load available filters on component mount
  useEffect(() => {
    const loadFilterData = async () => {
      try {
        const filterData = searchEngine.getAvailableFilters()
        setAvailableFilters(filterData)
      } catch (err) {
        console.error('Failed to load filter data:', err)
      }
    }

    loadFilterData()
  }, [database])

  // URL synchronization for filters
  useEffect(() => {
    const updateURL = () => {
      const params = new URLSearchParams()
      
      if (query) params.set('q', query)
      if (filters.level?.length) params.set('level', filters.level.join(','))
      if (filters.services?.length) params.set('services', filters.services.join(','))
      if (filters.topics?.length) params.set('topics', filters.topics.join(','))
      if (filters.industry?.length) params.set('industry', filters.industry.join(','))
      if (filters.sessionType?.length) params.set('sessionType', filters.sessionType.join(','))
      if (filters.duration?.min !== undefined) params.set('minDuration', filters.duration.min.toString())
      if (filters.duration?.max !== undefined) params.set('maxDuration', filters.duration.max.toString())
      if (filters.dateRange?.start) params.set('startDate', filters.dateRange.start.toISOString().split('T')[0])
      if (filters.dateRange?.end) params.set('endDate', filters.dateRange.end.toISOString().split('T')[0])
      
      const newURL = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
      window.history.replaceState({}, '', newURL)
    }

    updateURL()
  }, [query, filters])

  // Load filters from URL on component mount
  useEffect(() => {
    const loadFiltersFromURL = () => {
      const params = new URLSearchParams(window.location.search)
      const urlFilters: FilterState = {}
      
      const queryParam = params.get('q')
      if (queryParam) setQuery(queryParam)
      
      const levelParam = params.get('level')
      if (levelParam) urlFilters.level = levelParam.split(',')
      
      const servicesParam = params.get('services')
      if (servicesParam) urlFilters.services = servicesParam.split(',')
      
      const topicsParam = params.get('topics')
      if (topicsParam) urlFilters.topics = topicsParam.split(',')
      
      const industryParam = params.get('industry')
      if (industryParam) urlFilters.industry = industryParam.split(',')
      
      const sessionTypeParam = params.get('sessionType')
      if (sessionTypeParam) urlFilters.sessionType = sessionTypeParam.split(',')
      
      const minDurationParam = params.get('minDuration')
      const maxDurationParam = params.get('maxDuration')
      if (minDurationParam || maxDurationParam) {
        const duration: any = {}
        if (minDurationParam) duration.min = parseInt(minDurationParam)
        if (maxDurationParam) duration.max = parseInt(maxDurationParam)
        urlFilters.duration = duration
      }
      
      const startDateParam = params.get('startDate')
      const endDateParam = params.get('endDate')
      if (startDateParam || endDateParam) {
        urlFilters.dateRange = {
          start: startDateParam ? new Date(startDateParam) : new Date('2025-01-01'),
          end: endDateParam ? new Date(endDateParam) : new Date()
        }
      }
      
      if (Object.keys(urlFilters).length > 0) {
        setFilters(urlFilters)
      }
    }

    loadFiltersFromURL()
  }, [])

  // Auto-complete functionality
  useEffect(() => {
    const generateSuggestions = async () => {
      if (query.length < 2) {
        setSuggestions([])
        return
      }

      try {
        // Get available filter values for suggestions
        const allTerms = [
          ...availableFilters.services,
          ...availableFilters.topics,
          ...availableFilters.industries
        ]

        // Filter terms that match the current query
        const matchingSuggestions = allTerms
          .filter(term => term.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 5) // Limit to 5 suggestions

        setSuggestions(matchingSuggestions)
      } catch (err) {
        console.warn('Failed to generate suggestions:', err)
        setSuggestions([])
      }
    }

    const debounceTimer = setTimeout(generateSuggestions, 300)
    return () => clearTimeout(debounceTimer)
  }, [query, availableFilters])

  const handleSearch = async (searchQuery?: string) => {
    const queryToSearch = searchQuery || query
    
    setLoading(true)
    setError(null)
    setShowSuggestions(false)

    try {
      // Convert filter state to search options
      const searchOptions: SearchOptions = {
        level: filters.level as any,
        services: filters.services,
        topics: filters.topics,
        industry: filters.industry,
        sessionType: filters.sessionType as any,
        channels: filters.channels,
        duration: filters.duration,
        dateRange: filters.dateRange,
        metadataSource: filters.metadataSource as any,
        limit: 50
      }

      const searchResults = await searchEngine.hybridSearch(queryToSearch, searchOptions)
      setResults(searchResults)
    } catch (err) {
      console.error('Search failed:', err)
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  // Trigger search when filters change
  useEffect(() => {
    if (query.trim() || Object.values(filters).some(value => 
      Array.isArray(value) ? value.length > 0 : value !== undefined
    )) {
      handleSearch()
    } else {
      setResults([])
    }
  }, [filters])

  const handleFilterChange = (filterType: keyof FilterState, value: any) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }))
  }

  const addFilterValue = (filterType: keyof FilterState, value: string) => {
    setFilters(prev => {
      const currentValues = (prev[filterType] as string[]) || []
      if (!currentValues.includes(value)) {
        return {
          ...prev,
          [filterType]: [...currentValues, value]
        }
      }
      return prev
    })
  }

  const removeFilterValue = (filterType: keyof FilterState, value: string) => {
    setFilters(prev => {
      const currentValues = (prev[filterType] as string[]) || []
      return {
        ...prev,
        [filterType]: currentValues.filter(v => v !== value)
      }
    })
  }

  const clearAllFilters = () => {
    setFilters({})
  }

  const getActiveFilterCount = (): number => {
    return Object.values(filters).reduce((count, value) => {
      if (Array.isArray(value)) {
        return count + value.length
      } else if (value !== undefined) {
        return count + 1
      }
      return count
    }, 0)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    setShowSuggestions(value.length >= 2)
    setSelectedSuggestion(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSuggestion(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedSuggestion(prev => prev > 0 ? prev - 1 : -1)
        break
      case 'Enter':
        if (selectedSuggestion >= 0) {
          e.preventDefault()
          const selectedQuery = suggestions[selectedSuggestion]
          setQuery(selectedQuery)
          setShowSuggestions(false)
          handleSearch(selectedQuery)
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        setSelectedSuggestion(-1)
        break
    }
  }

  const selectSuggestion = (suggestion: string) => {
    setQuery(suggestion)
    setShowSuggestions(false)
    handleSearch(suggestion)
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Filter Sidebar */}
      <div className={`lg:col-span-1 ${showFilters ? 'block' : 'hidden lg:block'}`}>
        <div className="bg-white shadow rounded-lg p-6 space-y-6 sticky top-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Filters</h3>
            <div className="flex items-center space-x-2">
              {getActiveFilterCount() > 0 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {getActiveFilterCount()}
                </span>
              )}
              {getActiveFilterCount() > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-sm text-blue-600 hover:text-blue-500"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="lg:hidden text-gray-400 hover:text-gray-500"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Technical Level Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Technical Level
            </label>
            <div className="space-y-2">
              {availableFilters.levels.map((level) => (
                <label key={level} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.level?.includes(level) || false}
                    onChange={(e) => {
                      if (e.target.checked) {
                        addFilterValue('level', level)
                      } else {
                        removeFilterValue('level', level)
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">{level}</span>
                </label>
              ))}
            </div>
          </div>

          {/* AWS Services Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              AWS Services
            </label>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {availableFilters.services.slice(0, 10).map((service) => (
                <label key={service} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.services?.includes(service) || false}
                    onChange={(e) => {
                      if (e.target.checked) {
                        addFilterValue('services', service)
                      } else {
                        removeFilterValue('services', service)
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700 truncate">{service}</span>
                </label>
              ))}
              {availableFilters.services.length > 10 && (
                <p className="text-xs text-gray-500 mt-2">
                  Showing top 10 of {availableFilters.services.length} services
                </p>
              )}
            </div>
          </div>

          {/* Topics Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Topics
            </label>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {availableFilters.topics.slice(0, 10).map((topic) => (
                <label key={topic} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.topics?.includes(topic) || false}
                    onChange={(e) => {
                      if (e.target.checked) {
                        addFilterValue('topics', topic)
                      } else {
                        removeFilterValue('topics', topic)
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700 truncate">{topic}</span>
                </label>
              ))}
              {availableFilters.topics.length > 10 && (
                <p className="text-xs text-gray-500 mt-2">
                  Showing top 10 of {availableFilters.topics.length} topics
                </p>
              )}
            </div>
          </div>

          {/* Session Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Session Type
            </label>
            <div className="space-y-2">
              {availableFilters.sessionTypes.map((type) => (
                <label key={type} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.sessionType?.includes(type) || false}
                    onChange={(e) => {
                      if (e.target.checked) {
                        addFilterValue('sessionType', type)
                      } else {
                        removeFilterValue('sessionType', type)
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Duration Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Duration (minutes)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.duration?.min || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : undefined
                    handleFilterChange('duration', {
                      ...filters.duration,
                      min: value
                    })
                  }}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.duration?.max || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : undefined
                    handleFilterChange('duration', {
                      ...filters.duration,
                      max: value
                    })
                  }}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>
          </div>

          {/* Date Range Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Published Date
            </label>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <input
                  type="date"
                  value={filters.dateRange?.start?.toISOString().split('T')[0] || ''}
                  onChange={(e) => {
                    const value = e.target.value ? new Date(e.target.value) : undefined
                    handleFilterChange('dateRange', {
                      ...filters.dateRange,
                      start: value
                    })
                  }}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <input
                  type="date"
                  value={filters.dateRange?.end?.toISOString().split('T')[0] || ''}
                  onChange={(e) => {
                    const value = e.target.value ? new Date(e.target.value) : undefined
                    handleFilterChange('dateRange', {
                      ...filters.dateRange,
                      end: value
                    })
                  }}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>
          </div>

          {/* Active Filters Display */}
          {getActiveFilterCount() > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Active Filters</h4>
              <div className="space-y-1">
                {filters.level?.map((level) => (
                  <div key={level} className="flex items-center justify-between bg-blue-50 px-2 py-1 rounded">
                    <span className="text-sm text-blue-800">Level: {level}</span>
                    <button
                      onClick={() => removeFilterValue('level', level)}
                      className="text-blue-600 hover:text-blue-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {filters.services?.map((service) => (
                  <div key={service} className="flex items-center justify-between bg-purple-50 px-2 py-1 rounded">
                    <span className="text-sm text-purple-800 truncate">Service: {service}</span>
                    <button
                      onClick={() => removeFilterValue('services', service)}
                      className="text-purple-600 hover:text-purple-500 ml-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {filters.topics?.map((topic) => (
                  <div key={topic} className="flex items-center justify-between bg-green-50 px-2 py-1 rounded">
                    <span className="text-sm text-green-800 truncate">Topic: {topic}</span>
                    <button
                      onClick={() => removeFilterValue('topics', topic)}
                      className="text-green-600 hover:text-green-500 ml-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {filters.sessionType?.map((type) => (
                  <div key={type} className="flex items-center justify-between bg-red-50 px-2 py-1 rounded">
                    <span className="text-sm text-red-800">Type: {type}</span>
                    <button
                      onClick={() => removeFilterValue('sessionType', type)}
                      className="text-red-600 hover:text-red-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="lg:col-span-3 space-y-6">
        {/* Search Form */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Search Videos</h2>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="lg:hidden inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.414A1 1 0 013 6.707V4z" />
              </svg>
              Filters {getActiveFilterCount() > 0 && `(${getActiveFilterCount()})`}
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  ref={searchInputRef}
                  type="text"
                  id="search"
                  value={query}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setShowSuggestions(query.length >= 2)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pr-10 sm:text-sm border-gray-300 rounded-md"
                  placeholder="Search for AWS re:Invent videos..."
                  autoComplete="off"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              
              {/* Auto-complete suggestions */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={suggestion}
                      className={`cursor-pointer select-none relative py-2 pl-3 pr-9 ${
                        index === selectedSuggestion
                          ? 'text-white bg-blue-600'
                          : 'text-gray-900 hover:bg-gray-50'
                      }`}
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      <span className="block truncate">{suggestion}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Searching...
                  </>
                ) : (
                  'Search'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Search Error</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Search Results ({results.length})
            </h2>
          <div className="space-y-6">
            {results.map((result, index) => (
              <div key={`${result.video.id}-${index}`} className="border-b border-gray-200 pb-6 last:border-b-0">
                <div className="flex items-start space-x-4">
                  {/* Video Thumbnail */}
                  <div className="flex-shrink-0">
                    <img
                      src={result.video.thumbnailUrl}
                      alt={result.video.title}
                      className="w-40 h-24 object-cover rounded-lg shadow-sm"
                    />
                  </div>
                  
                  {/* Video Information */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          <a
                            href={result.video.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 transition-colors"
                          >
                            {result.video.title}
                          </a>
                        </h3>
                        
                        <div className="flex items-center space-x-4 text-sm text-gray-500 mb-2">
                          <span>{result.video.channelTitle}</span>
                          <span>•</span>
                          <span>{formatDuration(result.video.duration)}</span>
                          <span>•</span>
                          <span>{result.video.publishedAt.toLocaleDateString()}</span>
                          {result.video.level !== 'Unknown' && (
                            <>
                              <span>•</span>
                              <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">
                                {result.video.level}
                              </span>
                            </>
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
                      
                      <div className="flex-shrink-0 text-right">
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
                        <h4 className="text-sm font-medium text-gray-700 mb-3">
                          Relevant Segments:
                        </h4>
                        <div className="space-y-3">
                          {result.segments.slice(0, 5).map((segment) => (
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
                              {segment.confidence && (
                                <div className="mt-2 text-xs text-gray-500">
                                  Confidence: {(segment.confidence * 100).toFixed(1)}%
                                </div>
                              )}
                            </div>
                          ))}
                          
                          {result.segments.length > 5 && (
                            <div className="text-center">
                              <button className="text-sm text-blue-600 hover:text-blue-500 font-medium">
                                Show {result.segments.length - 5} more segments
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
        {!loading && results.length === 0 && (query || getActiveFilterCount() > 0) && (
          <div className="bg-white shadow rounded-lg p-6 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No results found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Try adjusting your search terms or filters.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}