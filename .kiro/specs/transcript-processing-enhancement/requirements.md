# Requirements Document

## Introduction

This feature enhances the video transcript processing pipeline to use Amazon Nova Lite for intelligent transcript analysis, reducing the number of segments from thousands to meaningful chunks, and extracting structured metadata (industry, speakers, level, services) from the transcript content.

## Glossary

- **Amazon Nova 2 Lite**: AWS Bedrock foundation model (`amazon.nova-2-lite-v1:0`) for text understanding and generation
- **Transcript Segment**: A meaningful chunk of transcript text (minimum 1000 characters) suitable for embedding
- **Metadata Extraction**: Process of identifying structured information (speakers, services, topics) from unstructured transcript text
- **Embedding**: Vector representation of text for semantic search

## Requirements

### Requirement 1

**User Story:** As a data pipeline operator, I want transcripts to be consolidated into meaningful segments, so that the database contains fewer, more useful chunks for search.

#### Acceptance Criteria

1. WHEN a transcript is processed THEN the system SHALL consolidate VTT segments into chunks of at least 1000 characters each
2. WHEN consolidating segments THEN the system SHALL preserve timestamp boundaries for the start and end of each chunk
3. WHEN a transcript has fewer than 1000 characters total THEN the system SHALL create a single segment with all content

### Requirement 2

**User Story:** As a search user, I want video metadata extracted from transcripts, so that I can filter and find videos by speaker, service, and topic.

#### Acceptance Criteria

1. WHEN processing a transcript THEN the system SHALL use Amazon Nova 2 Lite to extract speaker names mentioned in the content
2. WHEN processing a transcript THEN the system SHALL use Amazon Nova 2 Lite to identify AWS services discussed
3. WHEN processing a transcript THEN the system SHALL use Amazon Nova 2 Lite to extract industry/vertical context
4. WHEN processing a transcript THEN the system SHALL use Amazon Nova 2 Lite to identify session topics and themes

### Requirement 3

**User Story:** As a data pipeline operator, I want the session level derived from the video title, so that level classification is consistent with AWS re:Invent naming conventions.

#### Acceptance Criteria

1. WHEN a video title contains level indicators (100, 200, 300, 400) THEN the system SHALL map these to Introductory, Intermediate, Advanced, Expert respectively
2. WHEN a video title does not contain level indicators THEN the system SHALL default to Unknown level
3. WHEN extracting level from title THEN the system SHALL use regex pattern matching on session codes like "GBL206" or "WPS301"

### Requirement 4

**User Story:** As a data pipeline operator, I want embeddings generated only for consolidated segments, so that embedding costs and database size are reduced.

#### Acceptance Criteria

1. WHEN generating embeddings THEN the system SHALL only embed consolidated segments (not individual VTT lines)
2. WHEN a consolidated segment exceeds embedding model limits THEN the system SHALL split it at sentence boundaries
3. WHEN embedding segments THEN the system SHALL maintain the relationship between segment and source video
