import type { Database } from '@aws-reinvent-search/shared'
import initSqlJs from 'sql.js'

/**
 * DatabaseLoader handles downloading and initializing the SQLite database
 * for client-side operation with progress tracking, caching, and error handling
 */
export class DatabaseLoader {
  private static DATABASE_VERSION_KEY = 'reinvent-db-version'
  private static DATABASE_ETAG_KEY = 'reinvent-db-etag'
  private static DATABASE_CACHE_KEY = 'reinvent-db-cache'
  private static MAX_CACHE_SIZE = 100 * 1024 * 1024 // 100MB limit for localStorage fallback
  
  private progressCallback?: (progress: number) => void

  constructor(progressCallback?: (progress: number) => void) {
    this.progressCallback = progressCallback
  }

  /**
   * Download database from CDN with progress tracking and caching
   */
  async downloadDatabase(url: string): Promise<ArrayBuffer> {
    try {
      this.progressCallback?.(0)
      
      // Check for cached version first
      const cachedData = await this.getCachedDatabase()
      if (cachedData) {
        console.log('Using cached database')
        this.progressCallback?.(100)
        return cachedData
      }

      console.log('Downloading database from:', url)
      
      // Check if we need to download by comparing ETags
      const shouldDownload = await this.shouldDownloadUpdate(url)
      if (!shouldDownload) {
        const fallbackCache = await this.getCachedDatabase()
        if (fallbackCache) {
          this.progressCallback?.(100)
          return fallbackCache
        }
      }

      const response = await fetch(url, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to download database: ${response.status} ${response.statusText}`)
      }

      // Store ETag for future update checks
      const etag = response.headers.get('etag')
      if (etag) {
        localStorage.setItem(DatabaseLoader.DATABASE_ETAG_KEY, etag)
      }

      const contentLength = response.headers.get('content-length')
      if (!contentLength) {
        // If no content-length, just download without detailed progress
        this.progressCallback?.(50)
        const buffer = await response.arrayBuffer()
        await this.cacheDatabase(buffer)
        this.progressCallback?.(100)
        return buffer
      }

      const total = parseInt(contentLength, 10)
      let loaded = 0

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Failed to get response reader')
      }

      const chunks: Uint8Array[] = []

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break
        
        chunks.push(value)
        loaded += value.length
        
        // Report progress
        const progress = Math.min((loaded / total) * 90, 90) // Reserve 10% for caching
        this.progressCallback?.(progress)
      }

      // Combine chunks into single ArrayBuffer
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }

      const buffer = result.buffer
      
      // Cache the database
      this.progressCallback?.(95)
      await this.cacheDatabase(buffer)
      this.progressCallback?.(100)
      
      return buffer
      
    } catch (error) {
      console.error('Database download failed:', error)
      
      // Try to use cached version as fallback
      const fallbackCache = await this.getCachedDatabase()
      if (fallbackCache) {
        console.warn('Using cached database as fallback')
        this.progressCallback?.(100)
        return fallbackCache
      }
      
      throw new Error(`Failed to download database: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Initialize SQLite with the downloaded database using sql.js
   */
  async initializeSQLite(buffer: ArrayBuffer): Promise<Database> {
    try {
      console.log('Initializing SQL.js...')
      
      // Initialize SQL.js
      const SQL = await initSqlJs({
        // Use CDN for WASM file to avoid MIME type issues
        locateFile: (file: string) => `https://sql.js.org/dist/${file}`
      })
      
      console.log('Creating database from buffer, size:', buffer.byteLength)
      const uint8Array = new Uint8Array(buffer)
      console.log('First few bytes:', Array.from(uint8Array.slice(0, 16)))
      
      // Create database from buffer
      const sqlDb = new SQL.Database(uint8Array)
      console.log('Database created successfully')
      
      // Test basic connectivity
      console.log('Testing basic database connectivity...')
      const testResult = sqlDb.exec("SELECT 1 as test")
      console.log('Basic connectivity test result:', testResult)
      
      // Create a wrapper that implements our Database interface
      const db: Database = {
        exec: (options: { sql: string; bind?: any[]; returnValue?: 'resultRows' | 'saveSql' }): any[] => {
          try {
            const result = sqlDb.exec(options.sql, options.bind)
            
            if (options.returnValue === 'resultRows') {
              // Convert SQL.js result format to our expected format
              const rows: any[] = []
              for (const statement of result) {
                if (statement.values && statement.values.length > 0) {
                  rows.push(...statement.values)
                }
              }
              return rows
            }
            
            return result
          } catch (error) {
            console.error('SQL execution error:', error)
            return []
          }
        },
        close: () => {
          try {
            sqlDb.close()
          } catch (error) {
            console.warn('Error closing database:', error)
          }
        }
      }
      
      // Verify database structure
      this.verifyDatabaseStructure(db)
      
      console.log('SQLite database initialized successfully')
      return db
      
    } catch (error) {
      console.error('SQLite initialization failed:', error)
      throw new Error(`Failed to initialize SQLite: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Check for database updates by comparing ETags or version headers
   */
  async checkForUpdates(): Promise<boolean> {
    try {
      const cachedVersion = localStorage.getItem(DatabaseLoader.DATABASE_VERSION_KEY)
      const cachedETag = localStorage.getItem(DatabaseLoader.DATABASE_ETAG_KEY)
      
      // If no cached version, we need to download
      if (!cachedVersion) {
        return true
      }

      // Check if cached version is older than 24 hours
      const cacheAge = Date.now() - parseInt(cachedVersion, 10)
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours
      
      if (cacheAge > maxAge) {
        console.log('Cache expired, checking for updates')
        return true
      }

      // If we have an ETag, we can do a more efficient check
      if (cachedETag) {
        // This would make a HEAD request in production
        // For now, assume no updates if cache is recent
        return false
      }

      return false
      
    } catch (error) {
      console.warn('Failed to check for updates:', error)
      // If we can't check for updates, assume we need to download
      return true
    }
  }

  /**
   * Check if we should download an update by comparing ETags
   */
  private async shouldDownloadUpdate(url: string): Promise<boolean> {
    try {
      const cachedETag = localStorage.getItem(DatabaseLoader.DATABASE_ETAG_KEY)
      if (!cachedETag) {
        return true
      }

      // Make HEAD request to check ETag
      const response = await fetch(url, { method: 'HEAD' })
      if (!response.ok) {
        return true // Download if we can't check
      }

      const currentETag = response.headers.get('etag')
      return currentETag !== cachedETag
      
    } catch (error) {
      console.warn('Failed to check ETag:', error)
      return true // Download if we can't check
    }
  }

  /**
   * Cache database in browser storage with fallback handling
   */
  private async cacheDatabase(buffer: ArrayBuffer): Promise<void> {
    try {
      // Try IndexedDB first (preferred for large files)
      if (this.isIndexedDBAvailable()) {
        await this.cacheToIndexedDB(buffer)
      } else if (buffer.byteLength < DatabaseLoader.MAX_CACHE_SIZE) {
        // Fallback to localStorage for smaller databases
        this.cacheToLocalStorage(buffer)
      } else {
        console.warn('Database too large for localStorage and IndexedDB not available')
      }
      
      // Store metadata
      localStorage.setItem(DatabaseLoader.DATABASE_VERSION_KEY, Date.now().toString())
      
    } catch (error) {
      console.warn('Failed to cache database:', error)
    }
  }

  /**
   * Retrieve cached database from browser storage
   */
  private async getCachedDatabase(): Promise<ArrayBuffer | null> {
    try {
      // Try IndexedDB first
      if (this.isIndexedDBAvailable()) {
        const cached = await this.getCachedFromIndexedDB()
        if (cached) return cached
      }
      
      // Fallback to localStorage
      return this.getCachedFromLocalStorage()
      
    } catch (error) {
      console.warn('Failed to retrieve cached database:', error)
      return null
    }
  }

  /**
   * Check if IndexedDB is available
   */
  private isIndexedDBAvailable(): boolean {
    try {
      return typeof window !== 'undefined' && window.indexedDB != null;
    } catch {
      return false;
    }
  }

  /**
   * Cache database to IndexedDB
   */
  private async cacheToIndexedDB(buffer: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ReInventVideoSearch', 10)
      
      request.onerror = () => reject(request.error)
      
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('database')) {
          db.createObjectStore('database')
        }
      }
      
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction(['database'], 'readwrite')
        const store = transaction.objectStore('database')
        
        const putRequest = store.put(buffer, DatabaseLoader.DATABASE_CACHE_KEY)
        
        putRequest.onsuccess = () => {
          db.close()
          resolve()
        }
        
        putRequest.onerror = () => {
          db.close()
          reject(putRequest.error)
        }
      }
    })
  }

  /**
   * Retrieve database from IndexedDB
   */
  private async getCachedFromIndexedDB(): Promise<ArrayBuffer | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ReInventVideoSearch', 1)
      
      request.onerror = () => reject(request.error)
      
      request.onsuccess = () => {
        const db = request.result
        
        if (!db.objectStoreNames.contains('database')) {
          db.close()
          resolve(null)
          return
        }
        
        const transaction = db.transaction(['database'], 'readonly')
        const store = transaction.objectStore('database')
        const getRequest = store.get(DatabaseLoader.DATABASE_CACHE_KEY)
        
        getRequest.onsuccess = () => {
          db.close()
          resolve(getRequest.result || null)
        }
        
        getRequest.onerror = () => {
          db.close()
          reject(getRequest.error)
        }
      }
    })
  }

  /**
   * Cache database to localStorage (for smaller databases)
   */
  private cacheToLocalStorage(buffer: ArrayBuffer): void {
    try {
      const base64 = this.arrayBufferToBase64(buffer)
      localStorage.setItem(DatabaseLoader.DATABASE_CACHE_KEY, base64)
    } catch (error) {
      console.warn('Failed to cache to localStorage:', error)
    }
  }

  /**
   * Retrieve database from localStorage
   */
  private getCachedFromLocalStorage(): ArrayBuffer | null {
    try {
      const base64 = localStorage.getItem(DatabaseLoader.DATABASE_CACHE_KEY)
      if (!base64) return null
      
      return this.base64ToArrayBuffer(base64)
    } catch (error) {
      console.warn('Failed to retrieve from localStorage:', error)
      return null
    }
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }

  /**
   * Verify that the database has the expected structure
   */
  private verifyDatabaseStructure(db: Database): void {
    try {
      console.log('Starting database structure verification...')

      // Check for required tables
      console.log('Executing query to check tables...')
      const result = db.exec({
        sql: "SELECT name FROM sqlite_master WHERE type='table'",
        returnValue: 'resultRows'
      })

      console.log('Query result:', result)

      const tableNames = result.map((row: any[]) => row[0])
      console.log('Found tables:', tableNames)

      // Only require videos table (simplified schema)
      if (!tableNames.includes('videos')) {
        throw new Error('Missing required table: videos')
      }

      // Check for FTS tables
      const ftsTableNames = tableNames.filter((name: string) => name.includes('_fts'))
      if (ftsTableNames.length === 0) {
        console.warn('No FTS tables found - full-text search may not work')
      }

      console.log('Database structure verified:', { tables: tableNames.length, ftsTables: ftsTableNames.length })

    } catch (error) {
      console.error('Database structure verification failed:', error)
      throw new Error(`Invalid database structure: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}