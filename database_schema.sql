-- events tablosu için SQL sorgusu
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  discord_event_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- voice_channels tablosu için SQL sorgusu
CREATE TABLE IF NOT EXISTS voice_channels (
  id SERIAL PRIMARY KEY,
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  discord_channel_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- matches tablosuna event_id alanı ekleme
ALTER TABLE matches ADD COLUMN IF NOT EXISTS event_id VARCHAR(255);

-- matches tablosu için indeksler
CREATE INDEX IF NOT EXISTS idx_matches_event_id ON matches(event_id);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_notified ON matches(notified);
CREATE INDEX IF NOT EXISTS idx_matches_voice_room_created ON matches(voice_room_created);

-- events tablosu için indeksler
CREATE INDEX IF NOT EXISTS idx_events_match_id ON events(match_id);
CREATE INDEX IF NOT EXISTS idx_events_discord_event_id ON events(discord_event_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

-- voice_channels tablosu için indeksler
CREATE INDEX IF NOT EXISTS idx_voice_channels_match_id ON voice_channels(match_id);
CREATE INDEX IF NOT EXISTS idx_voice_channels_discord_channel_id ON voice_channels(discord_channel_id);
CREATE INDEX IF NOT EXISTS idx_voice_channels_created_at ON voice_channels(created_at);

-- trigger: updated_at alanını otomatik güncelleme
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- events tablosu için trigger ekleme
DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- voice_channels tablosu için trigger ekleme
DROP TRIGGER IF EXISTS update_voice_channels_updated_at ON voice_channels;
CREATE TRIGGER update_voice_channels_updated_at
    BEFORE UPDATE ON voice_channels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
