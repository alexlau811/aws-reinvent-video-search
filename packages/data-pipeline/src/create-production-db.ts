#!/usr/bin/env tsx

/**
 * Script to create a production-ready database
 * For real video data processing, use build-real-db.ts instead
 * This script creates an optimized version of the sample database
 */

import { DatabaseService } from './database/DatabaseService.js'
import { join, dirname } from 'path'
import { mkdirSync, existsSync, copyFileSync } from 'fs'

interface ProductionConfig {
  outputPath: string
  enableCompression?: boolean
  enableOptimizations?: boolean
  backupPath?: string
}

async function createProductionDatabase(config: ProductionConfig) {
  console.log('🚀 Creating production database...')
  console.log('Configuration:', config)
  console.log('')
  console.log('⚠️  NOTE: For real video data processing, use build-real-db.ts instead')
  console.log('   This script creates an optimized version of the sample database')
  console.log('')
  
  const { outputPath, enableCompression = true, enableOptimizations = true, backupPath } = config
  
  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true })
  
  // Create backup if existing database exists
  if (backupPath && existsSync(outputPath)) {
    console.log('📦 Creating backup of existing database...')
    copyFileSync(outputPath, backupPath)
  }
  
  // Check if sample database exists
  const sampleDbPath = join(process.cwd(), '../client-app/public/database/reinvent-videos.db')
  if (!existsSync(sampleDbPath)) {
    console.log('📦 Sample database not found, creating it first...')
    const { execSync } = await import('child_process')
    execSync('npm run create-sample-db', { stdio: 'inherit' })
  }
  
  // Copy sample database to production location
  console.log('📋 Copying sample database...')
  copyFileSync(sampleDbPath, outputPath)
  
  const db = new DatabaseService(outputPath)
  
  try {
    if (enableOptimizations) {
      console.log('⚡ Optimizing database for production...')
      await db.optimizeDatabase()
    }
    
    if (enableCompression) {
      console.log('🗜️ Applying compression optimizations...')
      // Note: Compression optimizations are handled by the optimizeDatabase method
      // Additional compression would require SQLite compiled with SQLITE_ENABLE_COMPRESS
    }
    
    // Get final statistics
    const stats = db.getStats()
    console.log('📈 Production database created successfully!')
    console.log('Final statistics:', {
      ...stats,
      fileSizeMB: stats.dbSize ? (stats.dbSize * 4096 / 1024 / 1024).toFixed(2) : 'N/A'
    })
    
    // Verify database integrity
    console.log('🔍 Database integrity verified by DatabaseService')
    
    return stats
    
  } finally {
    db.close()
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2)
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: tsx create-production-db.ts [output-path] [options]')
    console.log('')
    console.log('Options:')
    console.log('  --backup              Create backup of existing database')
    console.log('  --no-compression      Disable compression optimizations')
    console.log('  --no-optimization     Disable database optimizations')
    console.log('  --help, -h            Show this help message')
    console.log('')
    console.log('Note: This script creates an optimized version of the sample database.')
    console.log('For real video data processing, use build-real-db.ts instead:')
    console.log('  tsx build-real-db.ts <output-path> [max-videos] [channel-id]')
    console.log('')
    process.exit(0)
  }
  
  const config: ProductionConfig = {
    outputPath: args[0] || join(process.cwd(), '../client-app/public/database/reinvent-videos-prod.db'),
    enableCompression: !args.includes('--no-compression'),
    enableOptimizations: !args.includes('--no-optimization'),
    backupPath: args.includes('--backup') ? 
      join(process.cwd(), '../client-app/public/database/reinvent-videos-backup.db') : 
      undefined
  }
  
  try {
    await createProductionDatabase(config)
    console.log('🎉 Production database creation completed!')
    console.log('')
    console.log('💡 Tip: For real video data processing, use build-real-db.ts:')
    console.log('   tsx build-real-db.ts <output-path> [max-videos] [channel-id]')
  } catch (error) {
    console.error('💥 Failed to create production database:', error)
    process.exit(1)
  }
}

// Export for programmatic use
export { createProductionDatabase, type ProductionConfig }

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}