-- Veritabanı performans optimizasyonları

-- matches tablosu için daha iyi indeksler
CREATE INDEX IF NOT EXISTS idx_matches_date_status_notified ON matches(date, status, notified);
CREATE INDEX IF NOT EXISTS idx_matches_date_status_voice_room_created ON matches(date, status, voice_room_created);
CREATE INDEX IF NOT EXISTS idx_matches_home_team_id ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team_id ON matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_league ON matches(league);

-- teams tablosu için indeksler
CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
CREATE INDEX IF NOT EXISTS idx_teams_short_name ON teams(short_name);

-- roles tablosu için indeksler
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_team_id ON roles(team_id);

-- Kompozit indeksler için sorgular
CREATE INDEX IF NOT EXISTS idx_matches_composite_1 ON matches(home_team_id, away_team_id, date, league);
CREATE INDEX IF NOT EXISTS idx_matches_composite_2 ON matches(notified, voice_room_created, date);

-- Veritabanı view'leri için performans optimizasyonu
CREATE OR REPLACE VIEW upcoming_matches_view AS
SELECT 
    m.id,
    m.date,
    m.time,
    m.league,
    m.status,
    m.google_link,
    m.broadcast_channel,
    m.home_win_probability,
    m.away_win_probability,
    m.draw_probability,
    m.notified,
    m.voice_room_created,
    ht.name as home_team_name,
    ht.logo as home_team_logo,
    ht.short_name as home_team_short_name,
    at.name as away_team_name,
    at.logo as away_team_logo,
    at.short_name as away_team_short_name
FROM matches m
JOIN teams ht ON m.home_team_id = ht.id
JOIN teams at ON m.away_team_id = at.id
WHERE m.status = 'scheduled' 
  AND m.date >= NOW()
  AND m.date <= NOW() + INTERVAL '7 days'
ORDER BY m.date ASC;

-- Notification için view
CREATE OR REPLACE VIEW notification_matches_view AS
SELECT 
    m.id,
    m.date,
    m.time,
    m.league,
    m.google_link,
    m.broadcast_channel,
    ht.name as home_team_name,
    ht.logo as home_team_logo,
    ht.short_name as home_team_short_name,
    at.name as away_team_name,
    at.logo as away_team_logo,
    at.short_name as away_team_short_name
FROM matches m
JOIN teams ht ON m.home_team_id = ht.id
JOIN teams at ON m.away_team_id = at.id
WHERE m.status = 'scheduled' 
  AND m.notified = false
  AND m.date >= NOW()
  AND m.date <= NOW() + INTERVAL '1 hour'
ORDER BY m.date ASC;

-- Voice room için view
CREATE OR REPLACE VIEW voice_room_matches_view AS
SELECT 
    m.id,
    m.date,
    m.time,
    m.league,
    ht.name as home_team_name,
    ht.logo as home_team_logo,
    ht.short_name as home_team_short_name,
    at.name as away_team_name,
    at.logo as away_team_logo,
    at.short_name as away_team_short_name
FROM matches m
JOIN teams ht ON m.home_team_id = ht.id
JOIN teams at ON m.away_team_id = at.id
WHERE m.status = 'scheduled' 
  AND m.voice_room_created = false
  AND m.date >= NOW()
  AND m.date <= NOW() + INTERVAL '15 minutes'
ORDER BY m.date ASC;

-- Trigger: notified durumuna göre otomatik güncelleme
CREATE OR REPLACE FUNCTION update_notified_status()
RETURNS TRIGGER AS $$
BEGIN
    -- notified durumunu güncellediğimizde cache'i temizle
    PERFORM pg_notify('cache_clear', 'matches');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notified_status
    AFTER UPDATE ON matches
    FOR EACH ROW
    WHEN (OLD.notified IS DISTINCT FROM NEW.notified)
    EXECUTE FUNCTION update_notified_status();

-- Trigger: voice_room_created durumuna göre otomatik güncelleme
CREATE OR REPLACE FUNCTION update_voice_room_status()
RETURNS TRIGGER AS $$
BEGIN
    -- voice_room_created durumunu güncellediğimizde cache'i temizle
    PERFORM pg_notify('cache_clear', 'matches');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_voice_room_status
    AFTER UPDATE ON matches
    FOR EACH ROW
    WHEN (OLD.voice_room_created IS DISTINCT FROM NEW.voice_room_created)
    EXECUTE FUNCTION update_voice_room_status();

-- Trigger: roles tablosu güncellemelerinde cache'i temizle
CREATE OR REPLACE FUNCTION update_roles_cache()
RETURNS TRIGGER AS $$
BEGIN
    -- roles tablosunu güncellediğimizde cache'i temizle
    PERFORM pg_notify('cache_clear', 'roles');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_roles_cache
    AFTER UPDATE OR DELETE ON roles
    EXECUTE FUNCTION update_roles_cache();

-- Tablo istatistiklerini güncelleme
ANALYZE matches;
ANALYZE teams;
ANALYZE roles;

-- VACUUM işlemi için planlama (transaction block dışında çalıştırılmalı)
-- Bu işlemi düzenli olarak çalıştırmak için cron job oluşturulabilir
-- VACUUM ANALYZE; -- Bu satırı kaldırdık, Supabase'de transaction block içinde çalışmaz
