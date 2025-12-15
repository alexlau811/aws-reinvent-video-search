import React, { useState, useEffect } from 'react'
import type { Database, SearchResult } from '@aws-reinvent-search/shared'
import { SearchEngine } from '../services'

interface BrowseInterfaceProps {
  database: Database
}

interface BrowseFilters {
  selectedTopic?: string
  selectedLevel?: string
  selectedSessionType?: string
  selectedService?: string
}

export const BrowseInterface: React.FC<BrowseInterfaceProps> = ({ database }) => {
  const [activeTab, setActiveTab] = useState<'topics' | 'services'>('topics')
  const [filters, setFilters] = useState<BrowseFilters>({})
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [availableFilters, setAvailableFilters] = useState({
    levels: [] as string[],
    services: [] as string[],
    topics: [] as string[],
    sessionTypes: [] as string[],
    channels: [] as string[]
  })

  const [filterStats, setFilterStats] = useState({
    totalVideos: 0,
    levelCounts: {} as Record<string, number>,
    serviceCounts: {} as Record<string, number>,
    topicCounts: {} as Record<string, number>,
    sessionTypeCounts: {} as Record<string, number>
  })

  const searchEngine = new SearchEngine(database)

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

  useEffect(() => {
    const loadResults = async () => {
      setLoading(true)
      setError(null)

      try {
        const searchOptions = {
          level: filters.selectedLevel ? [filters.selectedLevel as any] : undefined,
          services: filters.selectedService ? [filters.selectedService] : undefined,
          topics: filters.selectedTopic ? [filters.selectedTopic] : undefined,
          sessionType: filters.selectedSessionType ? [filters.selectedSessionType as any] : undefined,
          limit: 100
        }

        const searchResults = await searchEngine.search('', searchOptions)
        setResults(searchResults)
      } catch (err) {
        console.error('Browse search failed:', err)
        setError(err instanceof Error ? err.message : 'Browse search failed')
      } finally {
        setLoading(false)
      }
    }

    if (Object.values(filters).some(value => value)) {
      loadResults()
    } else {
      setResults([])
    }
  }, [filters])

  const handleFilterChange = (filterType: keyof BrowseFilters, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [filterType]: value }))
  }

  const clearFilters = () => setFilters({})

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  const getCategoryData = () => {
    if (activeTab === 'topics') {
      return availableFilters.topics.map(topic => ({
        name: topic,
        count: filterStats.topicCounts[topic] || 0
      })).sort((a, b) => b.count - a.count)
    }
    return availableFilters.services.map(service => ({
      name: service,
      count: filterStats.serviceCounts[service] || 0
    })).sort((a, b) => b.count - a.count)
  }

  const categoryData = getCategoryData()

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Browse Videos</h2>
        <p className="text-gray-600 mb-6">
          Discover AWS re:Invent videos by exploring topics and services.
        </p>

        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
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
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg p-6 space-y-6 sticky top-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Filters</h3>
              {Object.values(filters).some(value => value) && (
                <button onClick={clearFilters} className="text-sm text-blue-600 hover:text-blue-500">
                  Clear all
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {activeTab === 'topics' ? 'Topic' : 'AWS Service'}
              </label>
              <select
                value={activeTab === 'topics' ? filters.selectedTopic || '' : filters.selectedService || ''}
                onChange={(e) => {
                  const value = e.target.value || undefined
                  handleFilterChange(activeTab === 'topics' ? 'selectedTopic' : 'selectedService', value)
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Technical Level</label>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Session Type</label>
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
          </div>
        </div>

        <div className="lg:col-span-3">
          {!Object.values(filters).some(value => value) && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Browse by {activeTab === 'topics' ? 'Topic' : 'AWS Service'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryData.slice(0, 12).map((item) => (
                  <button
                    key={item.name}
                    onClick={() => handleFilterChange(activeTab === 'topics' ? 'selectedTopic' : 'selectedService', item.name)}
                    className="text-left p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="font-medium text-gray-900 mb-1 truncate">{item.name}</div>
                    <div className="text-sm text-gray-500">{item.count} videos</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {loading && (
            <div className="bg-white shadow rounded-lg p-6 text-center">
              <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-gray-600">Loading videos...</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Videos ({results.length})</h3>
              <div className="space-y-6">
                {results.map((result, index) => (
                  <div key={`${result.video.id}-${index}`} className="border-b border-gray-200 pb-6 last:border-b-0">
                    <div className="flex flex-col sm:flex-row items-start space-y-4 sm:space-y-0 sm:space-x-4">
                      <div className="flex-shrink-0 w-full sm:w-auto">
                        <img
                          src={result.video.thumbnailUrl}
                          alt={result.video.title}
                          className="w-full sm:w-40 h-32 sm:h-24 object-cover rounded-lg shadow-sm"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
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
                          <span>•</span>
                          <span>{formatDuration(result.video.duration)}</span>
                          <span>•</span>
                          <span>{result.video.publishedAt.toLocaleDateString()}</span>
                          {result.video.level !== 'Unknown' && (
                            <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">{result.video.level}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {result.video.services.slice(0, 3).map((service) => (
                            <span key={service} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {service}
                            </span>
                          ))}
                          {result.video.topics.slice(0, 2).map((topic) => (
                            <span key={topic} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && results.length === 0 && Object.values(filters).some(value => value) && (
            <div className="bg-white shadow rounded-lg p-6 text-center">
              <h3 className="mt-2 text-sm font-medium text-gray-900">No videos found</h3>
              <p className="mt-1 text-sm text-gray-500">Try adjusting your filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
