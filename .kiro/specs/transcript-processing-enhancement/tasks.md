# Implementation Plan

- [x] 1. Add segment consolidation to VideoDiscoveryService
  - [x] 1.1 Add `consolidateSegments()` method to combine VTT segments into 1000+ char chunks
    - Implement logic to accumulate text until minimum character threshold
    - Preserve startTime from first segment and endTime from last segment in each chunk
    - Handle edge case where total transcript is under 1000 chars
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 1.2 Write property test for segment consolidation
    - **Property 1: Minimum segment size**
    - **Property 2: Timestamp preservation**
    - **Validates: Requirements 1.1, 1.2**
  - [x] 1.3 Modify `parseVTTContent()` to call `consolidateSegments()` before returning
    - Call consolidation after parsing VTT lines
    - Return consolidated segments instead of raw VTT segments
    - _Requirements: 1.1_

- [x] 2. Add title-based level extraction to MetadataEnrichmentService
  - [x] 2.1 Add `extractLevelFromTitle()` method
    - Use regex to find session codes like "GBL206", "WPS301", "SEC401"
    - Map 1xx→Introductory, 2xx→Intermediate, 3xx→Advanced, 4xx→Expert
    - Return 'Unknown' if no level indicator found
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 2.2 Write property test for level extraction
    - **Property 3: Level mapping correctness**
    - **Validates: Requirements 3.1, 3.3**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Integrate Amazon Nova 2 Lite for metadata extraction
  - [x] 4.1 Add AWS Bedrock client to MetadataEnrichmentService
    - Install @aws-sdk/client-bedrock-runtime dependency
    - Initialize BedrockRuntimeClient with region configuration
    - Add MODEL_ID constant for 'amazon.nova-2-lite-v1:0'
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 4.2 Implement `extractFromTranscriptWithNova()` method
    - Create prompt for extracting speakers, services, topics, industry
    - Call Nova 2 Lite via Converse API
    - Parse JSON response into ExtractedMetadata structure
    - Add error handling with fallback to existing regex extraction
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 4.3 Replace `extractFromTranscript()` to use Nova 2 Lite
    - Update method to call `extractFromTranscriptWithNova()`
    - Maintain backward compatibility with existing interface
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [-] 5. Update build scripts to use new processing
  - [ ] 5.1 Update build-all-reinvent.ts to use consolidated segments
    - Use consolidated segments for embedding instead of raw VTT segments
    - Call `extractLevelFromTitle()` for level extraction
    - _Requirements: 4.1, 4.3_
  - [x] 5.2 Update build-all-videos.ts to use consolidated segments
    - Same changes as build-all-reinvent.ts
    - _Requirements: 4.1, 4.3_
  - [-] 5.3 Write property test for segment-video relationship
    - **Property 4: Segment-video relationship integrity**
    - **Validates: Requirements 4.3**

- [-] 6. Add sentence boundary splitting for long segments
  - [x] 6.1 Add `splitAtSentenceBoundaries()` method to handle segments exceeding embedding limits
    - Split at period, question mark, or exclamation mark followed by space
    - Ensure each split segment is under embedding model limit (8192 tokens)
    - _Requirements: 4.2_
  - [-] 6.2 Write property test for sentence boundary splitting
    - **Property 5: Long segment splitting at sentence boundaries**
    - **Validates: Requirements 4.2**

- [x] 7. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
