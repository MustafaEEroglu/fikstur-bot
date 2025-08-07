# Veritabanı Kurulumu ve Optimizasyonu

Bu dosya, Supabase veritabanınızın kurulumu ve optimizasyonu için adımları içerir.

## 📋 Gereken Adımlar

### 1. Temel Tabloların Oluşturulması

Öncelikle `database_schema.sql` dosyasını çalıştırarak temel tabloları oluşturun:

```sql
-- Supabase SQL Editor'da çalıştırın
-- database_schema.sql dosyasının içeriğini kopyalayııp yapıştırın
```

### 2. Performans Optimizasyonları

Daha sonra `database_optimization.sql` dosyasını çalıştırarak performans optimizasyonlarını uygulayın:

```sql
-- Supabase SQL Editor'da çalıştırın
-- database_optimization.sql dosyasının içeriğini kopyalayıp yapıştırın
```

### 3. Bakım Script'leri

`database_maintenance.sql` dosyasını düzenli olarak çalıştırarak veritabanınızın performansını koruyun:

```sql
-- Supabase SQL Editor'da çalıştırın
-- database_maintenance.sql dosyasının içeriğini kopyalayıp yapıştırın
```

## ⚠️ VACUUM Hatası Çözümü

Supabase'de `VACUUM cannot run inside a transaction block` hatası alıyorsanız:

### Sorun
Supabase, transaction block içinde VACUUM komutunu çalıştırmaz. Bu, güvenlik ve performans nedenleriyle böyle tasarlanmıştır.

### Çözüm

#### Yöntem 1: VACUUM'u Kaldırma (Önerilen)
`database_optimization.sql` dosyasındaki VACUUM satırını zaten kaldırdık. Bu, en güvenli çözümdür.

#### Yöntem 2: Bakım Script'ini Kullanma
`database_maintenance.sql` dosyasını kullanarak veritabanınızı bakım yapın:

```sql
-- Supabase SQL Editor'da doğrudan çalıştırın
-- Bu script transaction block içinde çalışmaz
```

#### Yöntem 3: Supabase Dashboard'dan Bakım
1. Supabase dashboard'a gidin
2. Projenizi seçin
3. "Table Editor" bölümüne gidin
4. Tablo boyutlarını kontrol edin
5. Gerekirse manuel olarak VACUUM çalıştırın

## 🔄 Düzenli Bakım İçin Öneriler

### 1. Otomatik Bakım
Supabase zaten otomatik olarak aşağıdaki işlemleri yapar:
- Autovacuum
- Autoanalyze
- Index bakımı
- Query optimizasyonu

### 2. Manuel Bakım
Düzenli olarak aşağıdaki işlemleri yapın:

```sql
-- Tablo istatistiklerini güncelleme
ANALYZE matches;
ANALYZE teams;
ANALYZE roles;
ANALYZE events;
ANALYZE voice_channels;

-- Tablo boyutlarını kontrol etme
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY size_bytes DESC;
```

### 3. Cache Yönetimi
Uygulama tarafında cache mekanizmalarını kullanıyorsanız, düzenli olarak temizleyin:

```sql
-- Cache temizleme fonksiyonu
SELECT clear_cache('all');
```

## 📊 Performans İzleme

### 1. Sorgu Performansı
Supabase dashboard'da "Performance" bölümünden sorgu performansını izleyin.

### 2. Tablo Boyutları
Düzenli olarak tablo boyutlarını kontrol edin:
- `matches` tablosu en büyük tablo olmalı
- `teams` ve `roles` tabloları sabit boyutta olmalı

### 3. Index Performansı
Yeni oluşturduğumuz indekslerin performansını kontrol edin:
- `idx_matches_date_status_notified`
- `idx_matches_date_status_voice_room_created`
- `idx_matches_composite_1`
- `idx_matches_composite_2`

### 4. View Syntax Hatası Çözümü
Eğer `CREATE OR REPLACE TABLE_SIZE_VIEW AS` komutuyla syntax hatası alıyorsanız, bunu `CREATE OR REPLACE VIEW table_size_view AS` olarak değiştirin. Supabase'de view oluştururken `CREATE OR REPLACE VIEW` syntax'ini kullanmalısınız.

## 🔧 İpuçları

### 1. Büyük Veri Setleri
Eğer çok fazla maç veriniz varsa:
- `matches` tablosunu partition edin
- Eski maçları arşivleyin
- Index'leri düzenli olarak yeniden oluşturun

### 2. Cache Stratejisi
- Uygulama tarafında cache kullanın
- Cache sürelerini ayarlayın
- Cache temizleme mekanizmalarını kurun

### 3. Hata Yönetimi
- Veritabanı hatalarını loglayın
- Retry mekanizmaları kurun
- Fallback stratejileri geliştirin

## 🚀 İleri Düzey Optimizasyonlar

### 1. Materialized View'ler
Daha karmaşık sorgular için materialized view'ler oluşturabilirsiniz:

```sql
CREATE MATERIALIZED VIEW upcoming_matches_mv AS
SELECT * FROM upcoming_matches_view;

-- Düzenli olarak güncelleme
REFRESH MATERIALIZED VIEW upcoming_matches_mv;
```

### 2. Partitioning
Büyük tablolar için partitioning kullanabilirsiniz:

```sql
-- Örnek: matches tablosunu tarihe göre partition etme
CREATE TABLE matches_2024 PARTITION OF matches
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

### 3. Connection Pooling
Supabase zaten connection pooling sağlar, ancak uygulamanızda connection pooling kullanmayı düşünebilirsiniz.

## 📞 Destek

Sorunlarınız için:
- Supabase dokümantasyonunu inceleyin
- GitHub Issues üzerinden iletişime geçin
- Supabase forumlarında yardım isteyin
