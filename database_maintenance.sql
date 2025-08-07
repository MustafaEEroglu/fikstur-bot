-- Bu script Supabase'de transaction block dışında çalıştırılmalıdır
-- Supabase SQL Editor'de doğrudan çalıştırılabilir veya cron job ile planlanabilir

-- Tablo istatistiklerini güncelleme
ANALYZE matches;
ANALYZE teams;
ANALYZE roles;

-- VACUUM işlemi (Supabase'de sadece autovacuum çalışır, manuel VACUUM genellikle gerekmez)
-- Eğer tablolar çok büyükse ve performans sorunu varsa, Supabase dashboard'dan
-- "Table Size" kontrolü yapılabilir ve gerekiyorsa manuel olarak VACUUM çalıştırılabilir

-- Önbellek temizleme için fonksiyon
CREATE OR REPLACE FUNCTION clear_cache(cache_type TEXT)
RETURNS VOID AS $$
BEGIN
    -- Belirli cache türlerini temizle
    IF cache_type = 'matches' OR cache_type = 'all' THEN
        RAISE NOTICE 'Matches cache temizleniyor';
    END IF;
    
    IF cache_type = 'roles' OR cache_type = 'all' THEN
        RAISE NOTICE 'Roles cache temizleniyor';
    END IF;
    
    IF cache_type = 'teams' OR cache_type = 'all' THEN
        RAISE NOTICE 'Teams cache temizleniyor';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Cache temizleme trigger'ı için alternatif yaklaşım
CREATE OR REPLACE FUNCTION notify_cache_clear()
RETURNS TRIGGER AS $$
BEGIN
    -- Bu fonksiyon, cache temizleme bildirimleri için kullanılabilir
    -- Uygulama tarafında bu bildirimleri dinleyebilirsiniz
    PERFORM pg_notify('cache_clear', TG_TABLE_NAME);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tablo güncellemelerinde cache bildirimi gönderme
CREATE OR REPLACE TRIGGER notify_matches_cache_clear
AFTER UPDATE OR DELETE ON matches
FOR EACH ROW
EXECUTE FUNCTION notify_cache_clear();

CREATE OR REPLACE TRIGGER notify_roles_cache_clear
AFTER UPDATE OR DELETE ON roles
FOR EACH ROW
EXECUTE FUNCTION notify_cache_clear();

CREATE OR REPLACE TRIGGER notify_teams_cache_clear
AFTER UPDATE OR DELETE ON teams
FOR EACH ROW
EXECUTE FUNCTION notify_cache_clear();

-- Performans kontrolü için view (CREATE OR REPLACE VIEW kullanmalıyız)
CREATE OR REPLACE VIEW table_size_view AS
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY size_bytes DESC;

-- Bu view'ı düzenli olarak kontrol ederek tablo büyümesini takip edebilirsiniz
