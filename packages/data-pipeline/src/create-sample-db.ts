#!/usr/bin/env tsx

/**
 * Script to create a sample database with test data for development
 */

import { DatabaseService } from './database/DatabaseService.js'
import type { VideoMetadata, VideoSegment } from '@aws-reinvent-search/shared'
import { join } from 'path'

// Sample video data
const sampleVideos: VideoMetadata[] = [
  {
    id: 'video1',
    title: 'AWS Lambda Best Practices for Serverless Applications',
    description: 'Learn about AWS Lambda best practices, performance optimization, and cost management for serverless applications.',
    channelId: 'aws-events',
    channelTitle: 'AWS Events',
    publishedAt: new Date('2024-12-01T10:00:00Z'),
    duration: 3600, // 1 hour
    thumbnailUrl: 'https://img.youtube.com/vi/video1/maxresdefault.jpg',
    youtubeUrl: 'https://youtube.com/watch?v=video1',
    level: 'Intermediate',
    services: ['AWS Lambda', 'API Gateway', 'CloudWatch'],
    topics: ['Serverless', 'Performance', 'Cost Optimization'],
    industry: ['Technology', 'Startups'],
    sessionType: 'Breakout',
    speakers: ['John Smith', 'Jane Doe'],
    metadataSource: 'combined',
    metadataConfidence: 0.95,
    extractedKeywords: ['lambda', 'serverless', 'performance', 'cost', 'optimization']
  },
  {
    id: 'video2',
    title: 'Amazon S3 Security and Encryption Deep Dive',
    description: 'Comprehensive guide to Amazon S3 security features, encryption options, and access control best practices.',
    channelId: 'aws-events',
    channelTitle: 'AWS Events',
    publishedAt: new Date('2024-12-02T14:30:00Z'),
    duration: 2700, // 45 minutes
    thumbnailUrl: 'https://img.youtube.com/vi/video2/maxresdefault.jpg',
    youtubeUrl: 'https://youtube.com/watch?v=video2',
    level: 'Advanced',
    services: ['Amazon S3', 'AWS KMS', 'IAM'],
    topics: ['Security', 'Encryption', 'Access Control'],
    industry: ['Finance', 'Healthcare', 'Government'],
    sessionType: 'Workshop',
    speakers: ['Alice Johnson', 'Bob Wilson'],
    metadataSource: 'transcript',
    metadataConfidence: 0.88,
    extractedKeywords: ['s3', 'security', 'encryption', 'kms', 'iam', 'access']
  },
  {
    id: 'video3',
    title: 'Building Data Lakes with AWS Analytics Services',
    description: 'Learn how to build scalable data lakes using AWS Glue, Amazon Athena, and Amazon Redshift for analytics workloads.',
    channelId: 'aws-events',
    channelTitle: 'AWS Events',
    publishedAt: new Date('2024-12-03T09:15:00Z'),
    duration: 4200, // 70 minutes
    thumbnailUrl: 'https://img.youtube.com/vi/video3/maxresdefault.jpg',
    youtubeUrl: 'https://youtube.com/watch?v=video3',
    level: 'Expert',
    services: ['AWS Glue', 'Amazon Athena', 'Amazon Redshift', 'Amazon S3'],
    topics: ['Data Lakes', 'Analytics', 'ETL', 'Big Data'],
    industry: ['Retail', 'Media', 'Healthcare'],
    sessionType: 'Keynote',
    speakers: ['Dr. Sarah Chen', 'Michael Brown'],
    metadataSource: 'video-metadata',
    metadataConfidence: 0.92,
    extractedKeywords: ['data', 'lake', 'analytics', 'glue', 'athena', 'redshift', 'etl']
  },
  {
    id: 'video4',
    title: 'Machine Learning on AWS: From Training to Production',
    description: 'End-to-end machine learning workflow using Amazon SageMaker, from data preparation to model deployment.',
    channelId: 'aws-events',
    channelTitle: 'AWS Events',
    publishedAt: new Date('2024-12-04T16:00:00Z'),
    duration: 3300, // 55 minutes
    thumbnailUrl: 'https://img.youtube.com/vi/video4/maxresdefault.jpg',
    youtubeUrl: 'https://youtube.com/watch?v=video4',
    level: 'Intermediate',
    services: ['Amazon SageMaker', 'AWS Lambda', 'Amazon S3', 'Amazon ECR'],
    topics: ['Machine Learning', 'MLOps', 'Model Deployment'],
    industry: ['Technology', 'Automotive', 'Finance'],
    sessionType: 'Breakout',
    speakers: ['Emma Davis', 'Ryan Martinez'],
    metadataSource: 'combined',
    metadataConfidence: 0.91,
    extractedKeywords: ['machine', 'learning', 'sagemaker', 'model', 'training', 'deployment']
  },
  {
    id: 'video5',
    title: 'Containerization with Amazon ECS and EKS',
    description: 'Compare Amazon ECS and EKS for container orchestration, including best practices and use cases.',
    channelId: 'aws-events',
    channelTitle: 'AWS Events',
    publishedAt: new Date('2024-12-05T11:45:00Z'),
    duration: 2400, // 40 minutes
    thumbnailUrl: 'https://img.youtube.com/vi/video5/maxresdefault.jpg',
    youtubeUrl: 'https://youtube.com/watch?v=video5',
    level: 'Intermediate',
    services: ['Amazon ECS', 'Amazon EKS', 'AWS Fargate', 'Application Load Balancer'],
    topics: ['Containers', 'Orchestration', 'Microservices'],
    industry: ['Technology', 'Gaming', 'E-commerce'],
    sessionType: 'Chalk Talk',
    speakers: ['Kevin Lee', 'Lisa Wang'],
    metadataSource: 'transcript',
    metadataConfidence: 0.87,
    extractedKeywords: ['containers', 'ecs', 'eks', 'kubernetes', 'fargate', 'orchestration']
  }
]

// Generate sample segments for each video
function generateSampleSegments(videoId: string, title: string, duration: number): VideoSegment[] {
  const segments: VideoSegment[] = []
  const segmentDuration = 30 // 30 seconds per segment
  const numSegments = Math.floor(duration / segmentDuration)
  
  // Sample texts based on video topic
  const sampleTexts: Record<string, string[]> = {
    video1: [
      'Welcome to this session on AWS Lambda best practices for serverless applications.',
      'Lambda functions are event-driven compute services that run your code without provisioning servers.',
      'One of the key best practices is to optimize your function memory allocation for performance.',
      'Cold starts can impact performance, so consider using provisioned concurrency for critical functions.',
      'Monitoring and observability are crucial - use CloudWatch metrics and X-Ray tracing.',
      'Cost optimization involves right-sizing memory, optimizing execution time, and using appropriate triggers.'
    ],
    video2: [
      'Amazon S3 provides multiple layers of security to protect your data at rest and in transit.',
      'Server-side encryption options include SSE-S3, SSE-KMS, and SSE-C for different use cases.',
      'Bucket policies and IAM policies work together to control access to your S3 resources.',
      'Access logging and CloudTrail integration help you monitor and audit S3 access patterns.',
      'Cross-region replication can be configured with encryption to maintain security across regions.',
      'VPC endpoints allow secure access to S3 from your private network without internet gateway.'
    ],
    video3: [
      'Data lakes provide a centralized repository for structured and unstructured data at scale.',
      'AWS Glue automates the ETL process with serverless data integration capabilities.',
      'Amazon Athena enables interactive query analysis directly on data stored in S3.',
      'Partitioning strategies in S3 can significantly improve query performance and reduce costs.',
      'Amazon Redshift Spectrum extends your data warehouse to query data directly in S3.',
      'Data cataloging with AWS Glue helps maintain metadata and schema evolution over time.'
    ],
    video4: [
      'Amazon SageMaker provides a fully managed platform for machine learning workflows.',
      'Data preparation is crucial - use SageMaker Data Wrangler for visual data preparation.',
      'Built-in algorithms and frameworks support various machine learning use cases.',
      'Model training can be distributed across multiple instances for faster processing.',
      'SageMaker endpoints provide real-time inference with auto-scaling capabilities.',
      'MLOps practices include model versioning, A/B testing, and continuous monitoring.'
    ],
    video5: [
      'Container orchestration simplifies deployment and management of containerized applications.',
      'Amazon ECS provides a fully managed container orchestration service with deep AWS integration.',
      'Amazon EKS offers managed Kubernetes for teams already familiar with Kubernetes.',
      'AWS Fargate removes the need to manage underlying EC2 instances for containers.',
      'Service discovery and load balancing are built-in features for both ECS and EKS.',
      'Auto-scaling policies can be configured to handle varying workloads efficiently.'
    ]
  }
  
  const texts = sampleTexts[videoId] || ['Sample segment text for ' + title]
  
  for (let i = 0; i < numSegments && i < 20; i++) { // Limit to 20 segments per video
    const startTime = i * segmentDuration
    const endTime = Math.min(startTime + segmentDuration, duration)
    const text = texts[i % texts.length]
    
    // Generate a simple embedding (1024 dimensions with random values for Nova 2 compatibility)
    const embedding = Array.from({ length: 1024 }, () => Math.random() * 2 - 1)
    
    segments.push({
      id: `${videoId}_seg_${i + 1}`,
      videoId,
      startTime,
      endTime,
      text,
      embedding,
      confidence: 0.85 + Math.random() * 0.1, // Random confidence between 0.85-0.95
      speaker: i % 2 === 0 ? 'Speaker 1' : 'Speaker 2'
    })
  }
  
  return segments
}

async function createSampleDatabase() {
  console.log('Creating sample database...')
  
  // Create database service with file path
  const dbPath = join(process.cwd(), '../client-app/public/database/reinvent-videos.db')
  console.log('Database path:', dbPath)
  
  // Ensure directory exists
  const { mkdirSync } = await import('fs')
  const { dirname } = await import('path')
  mkdirSync(dirname(dbPath), { recursive: true })
  
  const db = new DatabaseService(dbPath)
  
  try {
    // Insert sample videos
    console.log('Inserting sample videos...')
    await db.updateVideoMetadata(sampleVideos)
    
    // Insert sample segments for each video
    console.log('Inserting sample segments...')
    for (const video of sampleVideos) {
      const segments = generateSampleSegments(video.id, video.title, video.duration)
      await db.insertVideoSegments(segments)
    }
    
    // Optimize database
    console.log('Optimizing database...')
    await db.optimizeDatabase()
    
    // Get stats
    const stats = db.getStats()
    console.log('Database created successfully!')
    console.log('Stats:', stats)
    
  } finally {
    db.close()
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  createSampleDatabase().catch(console.error)
}