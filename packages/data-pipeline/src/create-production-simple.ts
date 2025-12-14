#!/usr/bin/env tsx

/**
 * Simple production database creator using existing sample data
 * This creates a production-optimized version of your sample database
 */

import { DatabaseService } from './database/DatabaseService.js'
import { ProductionDatabaseService } from './database/ProductionDatabaseService.js'
import { join } from 'path'
import { existsSync, copyFileSync } from 'fs'

async function createSimpleProductionDatabase() {
  console.log('🚀 Creating simple production database from sample data...')
  
  const sampleDbPath = join(process.cwd(), '../client-app/public/database/reinvent-videos.db')
  const prodDbPath = join(process.cwd(), '../client-app/public/database/reinvent-videos-prod.db')
  const backupPath = join(process.cwd(), '../client-app/public/database/reinvent-videos-backup.db')
  
  // Check if sample database exists
  if (!existsSync(sampleDbPath)) {
    console.log('📦 Sample database not found, creating it first...')
    const { execSync } = await import('child_process')
    execSync('npm run create-sample-db', { stdio: 'inherit' })
  }
  
  // Create backup if production database exists
  if (existsSync(prodDbPath)) {
    console.log('📦 Creating backup of existing production database...')
    copyFileSync(prodDbPath, backupPath)
  }
  
  // Copy sample database to production location
  console.log('📋 Copying sample database...')
  copyFileSync(sampleDbPath, prodDbPath)
  
  // Open with production service for optimizations
  console.log('⚡ Applying production optimizations...')
  const prodDb = new ProductionDatabaseService(prodDbPath, '1.0.0')
  
  try {
    // Apply production settings (already done in constructor)
    
    // Get current data for validation
    const stats = prodDb.getStats()
    console.log('📊 Current database stats:', stats)
    
    // Apply optimizations
    await prodDb.optimizeDatabase()
    
    // Verify integrity
    const verification = await prodDb.verifyDatabase()
    console.log('🔍 Database verification:', verification)
    
    if (!verification.integrityOk) {
      throw new Error('Database integrity check failed')
    }
    
    // Generate final metrics
    const finalStats = prodDb.getStats()
    console.log('📈 Final production database stats:', {
      ...finalStats,
      fileSizeMB: finalStats.dbSize ? (finalStats.dbSize * 4096 / 1024 / 1024).toFixed(2) : 'N/A'
    })
    
    console.log('✅ Simple production database created successfully!')
    console.log(`📍 Location: ${prodDbPath}`)
    console.log(`📦 Backup: ${backupPath}`)
    
    // Performance metrics
    if (verification.performanceMetrics) {
      console.log('⚡ Performance metrics:')
      console.log(`  Video queries: ${verification.performanceMetrics.videoQueryTime}ms`)
      console.log(`  Segment queries: ${verification.performanceMetrics.segmentQueryTime}ms`)
      console.log(`  FTS queries: ${verification.performanceMetrics.ftsQueryTime}ms`)
    }
    
  } finally {
    prodDb.close()
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  createSimpleProductionDatabase().catch(console.error)
}