-- AWS re:Invent Video Search Platform Database Schema
-- Simplified version: no embeddings, no segments, keyword/regex extraction only

-- Videos table with enriched metadata
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  published_at DATETIME NOT NULL,
  duration INTEGER NOT NULL,
  thumbnail_url TEXT,
  youtube_url TEXT NOT NULL,

  -- Enriched metadata (from keyword/regex extraction)
  level TEXT NOT NULL DEFAULT 'Unknown',
  services TEXT, -- JSON array
  topics TEXT,   -- JSON array
  industry TEXT, -- JSON array
  session_type TEXT NOT NULL DEFAULT 'Unknown',
  speakers TEXT, -- JSON array

  -- Metadata tracking
  metadata_source TEXT NOT NULL DEFAULT 'video-metadata',
  metadata_confidence REAL DEFAULT 0.0,
  extracted_keywords TEXT, -- JSON array

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Search optimization indexes
CREATE INDEX IF NOT EXISTS idx_videos_published_at ON videos (published_at);
CREATE INDEX IF NOT EXISTS idx_videos_duration ON videos (duration);
CREATE INDEX IF NOT EXISTS idx_videos_level ON videos (level);
CREATE INDEX IF NOT EXISTS idx_videos_session_type ON videos (session_type);
CREATE INDEX IF NOT EXISTS idx_videos_metadata_source ON videos (metadata_source);

-- Full-text search on title, description, and enriched metadata
CREATE VIRTUAL TABLE IF NOT EXISTS videos_fts USING fts5(
  title,
  description,
  services,
  topics,
  speakers,
  extracted_keywords,
  content='videos',
  content_rowid='rowid'
);

-- Triggers to keep FTS table in sync
CREATE TRIGGER IF NOT EXISTS videos_fts_insert AFTER INSERT ON videos BEGIN
  INSERT INTO videos_fts(rowid, title, description, services, topics, speakers, extracted_keywords)
  VALUES (new.rowid, new.title, new.description, new.services, new.topics, new.speakers, new.extracted_keywords);
END;

CREATE TRIGGER IF NOT EXISTS videos_fts_delete AFTER DELETE ON videos BEGIN
  INSERT INTO videos_fts(videos_fts, rowid, title, description, services, topics, speakers, extracted_keywords)
  VALUES ('delete', old.rowid, old.title, old.description, old.services, old.topics, old.speakers, old.extracted_keywords);
END;

CREATE TRIGGER IF NOT EXISTS videos_fts_update AFTER UPDATE ON videos BEGIN
  INSERT INTO videos_fts(videos_fts, rowid, title, description, services, topics, speakers, extracted_keywords)
  VALUES ('delete', old.rowid, old.title, old.description, old.services, old.topics, old.speakers, old.extracted_keywords);
  INSERT INTO videos_fts(rowid, title, description, services, topics, speakers, extracted_keywords)
  VALUES (new.rowid, new.title, new.description, new.services, new.topics, new.speakers, new.extracted_keywords);
END;
