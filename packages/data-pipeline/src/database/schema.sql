-- AWS re:Invent Video Search Platform Database Schema

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
  
  -- Enriched metadata
  level TEXT NOT NULL DEFAULT 'Unknown',
  services TEXT, -- JSON array
  topics TEXT,   -- JSON array
  industry TEXT, -- JSON array
  session_type TEXT NOT NULL DEFAULT 'Unknown',
  speakers TEXT, -- JSON array
  
  -- Metadata tracking
  metadata_source TEXT NOT NULL DEFAULT 'transcript',
  metadata_confidence REAL DEFAULT 0.0,
  extracted_keywords TEXT, -- JSON array
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Video segments table with embeddings
CREATE TABLE IF NOT EXISTS video_segments (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  text TEXT NOT NULL,
  embedding BLOB NOT NULL, -- Serialized float array
  confidence REAL,
  speaker TEXT,
  FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
);

-- Search optimization indexes
CREATE INDEX IF NOT EXISTS idx_videos_published_at ON videos (published_at);
CREATE INDEX IF NOT EXISTS idx_videos_duration ON videos (duration);
CREATE INDEX IF NOT EXISTS idx_videos_level ON videos (level);
CREATE INDEX IF NOT EXISTS idx_videos_session_type ON videos (session_type);
CREATE INDEX IF NOT EXISTS idx_videos_metadata_source ON videos (metadata_source);
CREATE INDEX IF NOT EXISTS idx_segments_video_id ON video_segments (video_id);
CREATE INDEX IF NOT EXISTS idx_segments_time ON video_segments (start_time, end_time);

-- Full-text search tables
CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(
  text, 
  content='video_segments', 
  content_rowid='rowid'
);

CREATE VIRTUAL TABLE IF NOT EXISTS videos_fts USING fts5(
  title, 
  services, 
  topics, 
  industry, 
  speakers, 
  extracted_keywords, 
  content='videos', 
  content_rowid='rowid'
);

-- Triggers to keep FTS tables in sync
CREATE TRIGGER IF NOT EXISTS videos_fts_insert AFTER INSERT ON videos BEGIN
  INSERT INTO videos_fts(rowid, title, services, topics, industry, speakers, extracted_keywords)
  VALUES (new.rowid, new.title, new.services, new.topics, new.industry, new.speakers, new.extracted_keywords);
END;

CREATE TRIGGER IF NOT EXISTS videos_fts_delete AFTER DELETE ON videos BEGIN
  INSERT INTO videos_fts(videos_fts, rowid, title, services, topics, industry, speakers, extracted_keywords)
  VALUES ('delete', old.rowid, old.title, old.services, old.topics, old.industry, old.speakers, old.extracted_keywords);
END;

CREATE TRIGGER IF NOT EXISTS videos_fts_update AFTER UPDATE ON videos BEGIN
  INSERT INTO videos_fts(videos_fts, rowid, title, services, topics, industry, speakers, extracted_keywords)
  VALUES ('delete', old.rowid, old.title, old.services, old.topics, old.industry, old.speakers, old.extracted_keywords);
  INSERT INTO videos_fts(rowid, title, services, topics, industry, speakers, extracted_keywords)
  VALUES (new.rowid, new.title, new.services, new.topics, new.industry, new.speakers, new.extracted_keywords);
END;

CREATE TRIGGER IF NOT EXISTS segments_fts_insert AFTER INSERT ON video_segments BEGIN
  INSERT INTO segments_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER IF NOT EXISTS segments_fts_delete AFTER DELETE ON video_segments BEGIN
  INSERT INTO segments_fts(segments_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;

CREATE TRIGGER IF NOT EXISTS segments_fts_update AFTER UPDATE ON video_segments BEGIN
  INSERT INTO segments_fts(segments_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO segments_fts(rowid, text) VALUES (new.rowid, new.text);
END;