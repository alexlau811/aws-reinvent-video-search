#!/usr/bin/env tsx

/**
 * Deploy production database to CDN (S3 + CloudFront)
 * This script handles database versioning and CDN deployment
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'
import { readFileSync, statSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'

interface DeploymentConfig {
  bucketName: string
  cloudFrontDistributionId?: string
  region: string
  dbPath: string
  keyPrefix?: string
  enableVersioning?: boolean
  enableCompression?: boolean
}

interface DeploymentResult {
  success: boolean
  version: string
  url: string
  size: number
  checksum: string
  uploadTime: number
}

class DatabaseDeploymentService {
  private s3Client: S3Client
  private cloudFrontClient?: CloudFrontClient

  constructor(region: string = 'us-east-1') {
    this.s3Client = new S3Client({ region })
    this.cloudFrontClient = new CloudFrontClient({ region })
  }

  async deployDatabase(config: DeploymentConfig): Promise<DeploymentResult> {
    console.log('🚀 Starting database deployment...')
    console.log('Configuration:', config)

    const {
      bucketName,
      cloudFrontDistributionId,
      dbPath,
      keyPrefix = 'database/',
      enableVersioning = true,
      enableCompression = true
    } = config

    // Read database file
    const dbBuffer = readFileSync(dbPath)
    const dbStats = statSync(dbPath)
    const checksum = createHash('sha256').update(dbBuffer).digest('hex')
    
    console.log(`📊 Database size: ${(dbStats.size / 1024 / 1024).toFixed(2)} MB`)
    console.log(`🔍 Checksum: ${checksum}`)

    // Generate version string
    const version = enableVersioning ? 
      `v${new Date().toISOString().slice(0, 10)}-${checksum.slice(0, 8)}` : 
      'latest'

    const key = `${keyPrefix}reinvent-videos-${version}.db`
    const latestKey = `${keyPrefix}reinvent-videos-latest.db`

    const uploadStart = Date.now()

    try {
      // Check if this version already exists
      if (enableVersioning) {
        try {
          await this.s3Client.send(new HeadObjectCommand({
            Bucket: bucketName,
            Key: key
          }))
          console.log(`⚠️ Version ${version} already exists, skipping upload`)
          return {
            success: true,
            version,
            url: `https://${bucketName}.s3.amazonaws.com/${key}`,
            size: dbStats.size,
            checksum,
            uploadTime: 0
          }
        } catch (error) {
          // File doesn't exist, continue with upload
        }
      }

      // Upload versioned file
      console.log(`📤 Uploading ${key}...`)
      await this.s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: dbBuffer,
        ContentType: 'application/x-sqlite3',
        ContentEncoding: enableCompression ? 'gzip' : undefined,
        CacheControl: 'public, max-age=31536000', // 1 year cache for versioned files
        Metadata: {
          version,
          checksum,
          'created-at': new Date().toISOString()
        }
      }))

      // Upload latest file (shorter cache)
      console.log(`📤 Uploading ${latestKey}...`)
      await this.s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: latestKey,
        Body: dbBuffer,
        ContentType: 'application/x-sqlite3',
        ContentEncoding: enableCompression ? 'gzip' : undefined,
        CacheControl: 'public, max-age=3600', // 1 hour cache for latest
        Metadata: {
          version,
          checksum,
          'created-at': new Date().toISOString()
        }
      }))

      const uploadTime = Date.now() - uploadStart

      // Invalidate CloudFront cache if configured
      if (cloudFrontDistributionId) {
        console.log('🔄 Invalidating CloudFront cache...')
        await this.cloudFrontClient!.send(new CreateInvalidationCommand({
          DistributionId: cloudFrontDistributionId,
          InvalidationBatch: {
            Paths: {
              Quantity: 1,
              Items: [`/${latestKey}`]
            },
            CallerReference: `db-deploy-${Date.now()}`
          }
        }))
      }

      const result: DeploymentResult = {
        success: true,
        version,
        url: `https://${bucketName}.s3.amazonaws.com/${key}`,
        size: dbStats.size,
        checksum,
        uploadTime
      }

      console.log('✅ Database deployment completed!')
      console.log('Result:', result)

      return result

    } catch (error) {
      console.error('❌ Deployment failed:', error)
      throw error
    }
  }

  /**
   * Create deployment manifest with version information
   */
  async createDeploymentManifest(
    bucketName: string,
    deploymentResult: DeploymentResult,
    keyPrefix: string = 'database/'
  ): Promise<void> {
    const manifest = {
      version: deploymentResult.version,
      url: deploymentResult.url,
      size: deploymentResult.size,
      checksum: deploymentResult.checksum,
      deployedAt: new Date().toISOString(),
      latestUrl: `https://${bucketName}.s3.amazonaws.com/${keyPrefix}reinvent-videos-latest.db`
    }

    const manifestKey = `${keyPrefix}manifest.json`
    
    await this.s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: manifestKey,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
      CacheControl: 'public, max-age=300' // 5 minutes cache
    }))

    console.log(`📋 Deployment manifest created: ${manifestKey}`)
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length < 2) {
    console.error('Usage: tsx deploy-production-db.ts <bucket-name> <db-path> [cloudfront-distribution-id]')
    console.error('Example: tsx deploy-production-db.ts my-bucket ../client-app/public/database/reinvent-videos-prod.db d123456789')
    process.exit(1)
  }

  const config: DeploymentConfig = {
    bucketName: args[0],
    dbPath: args[1],
    cloudFrontDistributionId: args[2],
    region: process.env.AWS_REGION || 'us-east-1',
    keyPrefix: process.env.DB_KEY_PREFIX || 'database/',
    enableVersioning: !process.env.DISABLE_VERSIONING,
    enableCompression: !process.env.DISABLE_COMPRESSION
  }

  const deploymentService = new DatabaseDeploymentService(config.region)

  try {
    const result = await deploymentService.deployDatabase(config)
    await deploymentService.createDeploymentManifest(config.bucketName, result, config.keyPrefix)
    
    console.log('🎉 Deployment completed successfully!')
    console.log(`📍 Database URL: ${result.url}`)
    console.log(`📍 Latest URL: https://${config.bucketName}.s3.amazonaws.com/${config.keyPrefix}reinvent-videos-latest.db`)
    
  } catch (error) {
    console.error('💥 Deployment failed:', error)
    process.exit(1)
  }
}

// Export for programmatic use
export { DatabaseDeploymentService, type DeploymentConfig, type DeploymentResult }

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}