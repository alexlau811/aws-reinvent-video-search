import { useState, useEffect } from 'react'
import { DatabaseLoader } from './services/DatabaseLoader'
import { SearchInterface } from './components/SearchInterface'
import { BrowseInterface } from './components/BrowseInterface'
import { LoadingScreen } from './components/LoadingScreen'
import { ErrorBoundary } from './components/ErrorBoundary'
import type { Database } from '@aws-reinvent-search/shared'

function App() {
  const [database, setDatabase] = useState<Database | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<'search' | 'browse'>('search')

  useEffect(() => {
    const initializeApp = async () => {
      try {
        setLoading(true)
        setError(null)
        setLoadingProgress(0)
        
        // Create database loader with progress callback
        const databaseLoader = new DatabaseLoader((progress) => {
          setLoadingProgress(Math.round(progress * 0.8)) // Reserve 20% for SQLite initialization
        })
        
        // Check for updates first
        const hasUpdates = await databaseLoader.checkForUpdates()
        if (hasUpdates) {
          console.log('Database updates available, downloading...')
        }
        
        // Download and initialize database
        const databaseUrl = '/database/reinvent-2025-complete.db' // This will be served from CDN
        const buffer = await databaseLoader.downloadDatabase(databaseUrl)
        setLoadingProgress(80)
        
        const db = await databaseLoader.initializeSQLite(buffer)
        setLoadingProgress(100)
        
        setDatabase(db)
        setLoading(false)
      } catch (err) {
        console.error('Failed to initialize application:', err)
        setError(err instanceof Error ? err.message : 'Failed to load application')
        setLoading(false)
      }
    }

    initializeApp()
  }, [])

  if (loading) {
    return <LoadingScreen progress={loadingProgress} />
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Application Error</h3>
            <p className="mt-1 text-sm text-gray-500">{error}</p>
            <div className="mt-6">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!database) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-lg font-medium text-gray-900">Database not loaded</h2>
          <p className="mt-1 text-sm text-gray-500">Please refresh the page to try again.</p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold text-gray-900">
              AWS re:Invent 2025 Video Search
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Search through AWS re:Invent conference videos using semantic search and filters
            </p>
          </div>
        </header>
        
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          {/* Tab Navigation */}
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('search')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'search'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Search
                </button>
                <button
                  onClick={() => setActiveTab('browse')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'browse'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Browse
                </button>
              </nav>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'search' ? (
            <SearchInterface database={database} />
          ) : (
            <BrowseInterface database={database} />
          )}
        </main>
      </div>
    </ErrorBoundary>
  )
}

export default App