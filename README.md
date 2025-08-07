# Fikstur Discord Botu

Discord tabanlı otomatik maç fikstürü bildirim botu. Bot, belirli liglerdeki maçları otomatik olarak takip eder, bildirim gönderir ve sesli odalar oluşturur.

## 🚀 Özellikler

### 📊 Maç Bildirimleri
- Maç başlamadan 1 saat önce otomatik bildirim
- Takımlara özel rollerle bildirim gönderme
- Maç oranları ve detaylı bilgiler içeren embed'ler
- Maç linkleri ve yayın bilgileri

### 🎵 Sesli Oda Yönetimi
- Maç başlamadan 15 dakika önce otomatik sesli oda oluşturma
- **Duplicate oda oluşturmayı engelleme** - Aynı anda birden fazla maç olsa bile sadece 1 oda
- **Bilgilendirici oda isimleri** - Takım kısaltmaları ve lig bilgisi içeren oda isimleri
- **Oda konumu** - Yeni oluşturulan odalar en üstte yer alır
- **2 saat sonra otomatik oda temizleme** - Maç bitiminde otomatik temizleme
- **Zengin bildirimler** - Embed formatında rol etiketlemeli bildirimler

### 📅 Haftalık Fikstür
- `/hafta` komutu ile gelecek 7 günlük maçları görüntüleme
- Takım ve lig bilgileri ile detaylı liste
- Tarih ve saat formatlaması

### 🤖 Akıllı Bildirim Sistemi
- Türk ve yabancı ligleri ayırt etme
- Takım isimlerine göre rol eşleştirme
- "barbarlar" rolü için özel ayarlar
- Bildirim önceliği ve zamanlama

### 🎯 AI Tahmin Entegrasyonu
- OpenRouter API ile maç kazanma olasılıkları
- **30 dakikalık önbellek sistemi** - API çağrılarını optimize etme
- Gerçek zamanlı oran hesaplama
- Yüzde normalizasyonu
- **Request Queue** - Aynı anda birden fazla API çağrısını önleme

### ⚡ Performans Optimizasyonları
- **Cache Sistemi** - Veritabanı sorgularını önbellekleme
- **Paralel İşlem** - Birden fazla işlemi aynı anda çalıştırma
- **Veritabanı İndeksleri** - Sorgu performansını artırma
- **Hata Yönetimi** - Gelişmiş loglama ve hata yakalama
- **Database View'leri** - Karmaşık sorguları optimize etme

## 🛠️ Teknoloji Yığını

- **Programlama Dili**: TypeScript
- **Discord Entegrasyonu**: discord.js v14
- **Veritabanı**: Supabase (PostgreSQL)
- **Harici API'ler**: 
  - SerpApi (maç verisi çekmek için)
  - OpenRouter (AI tahminleri için)
- **Barındırma**: Vercel (serverless functions)
- **Geliştirme Araçları**: nodemon, ts-node

## 📦 Kurulum

### Gereksinimler
- Node.js 18+
- npm veya yarn
- Discord Bot Token
- Supabase Hesabı
- SerpApi ve OpenRouter API Anahtarları

### Kurulum Adımları

1. **Depoyu klonlayın**
```bash
git clone https://github.com/kullaniciadi/fikstur-bot.git
cd fikstur-bot
```

2. **Bağımlılıkları yükleyin**
```bash
npm install
```

3. **Ortam değişkenlerini yapılandırın**
```bash
cp .env.example .env
```

4. **.env dosyasını düzenleyin**
```env
# Discord Bot Configuration
DISCORD_BOT_TOKEN=YOUR_DISCORD_BOT_TOKEN_HERE
DISCORD_CLIENT_ID=YOUR_DISCORD_CLIENT_ID_HERE
DISCORD_GUILD_ID=YOUR_DISCORD_SERVER_ID_HERE
DISCORD_FIXTURE_CHANNEL_ID=YOUR_FIXTURE_CHANNEL_ID_HERE

# Supabase Configuration
SUPABASE_URL=YOUR_SUPABASE_URL_HERE
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY_HERE
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE

# SerpApi Configuration
SERPAPI_API_KEY=YOUR_SERPAPI_API_KEY_HERE

# OpenRouter Configuration
OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY_HERE
```

5. **Botu derleyin**
```bash
npm run build
```

6. **Botu başlatın**
```bash
npm start
```

### Geliştirme Modu
```bash
npm run dev
```

## 🔧 Yapılandırma

### Discord Ayarları
1. [Discord Developer Portal](https://discord.com/developers/applications) üzerinden yeni bir uygulama oluşturun
2. Bot oluşturun ve gerekli izinleri verin:
   - `bot`
   - `applications.commands`
   - `guilds`
   - `guild_messages`
   - `guild_members`
   - `guild_voice_states`
   - `message_content`
3. Bot token'ını kopyalayın ve `.env` dosyasına ekleyin

### Supabase Ayarları
1. [Supabase](https://supabase.com/) üzerinden yeni bir proje oluşturun
2. Aşağıdaki tablolu oluşturun:
   - `teams` (takım bilgileri)
   - `matches` (maç bilgileri)
   - `roles` (Discord rolleri)
3. Service Role Key'yi kopyalayın ve `.env` dosyasına ekleyin

### API Anahtarları
1. [SerpApi](https://serpapi.com/) üzerinden API anahtarı alın
2. [OpenRouter](https://openrouter.ai/) üzerinden API anahtarı alın
3. Anahtarları `.env` dosyasına ekleyin

## 📖 Kullanım

### Komutlar
- `/hafta` - Gelecek 7 günlük maç fikstürünü gösterir
- `/test-notification` - Test bildirimi gönderir
- `/test-voice-room` - Test sesli oda oluşturur
- `/list-matches` - Yaklaşan maçları listeler
- `/clear-test-data` - Test verilerini temizler

### Otomatik Özellikler
- **Maç Bildirimleri**: Maç başlamadan 1 saat önce otomatik bildirim
- **Sesli Odalar**: Maç başlamadan 15 dakika önce otomatik sesli oda oluşturma
- **Haftalık Kontrol**: Her 3 dakikada bir yeni maçları kontrol etme

## 🚀 Dağıtım

### Vercel'e Dağıtım
1. [Vercel](https://vercel.com/) üzerinden yeni bir proje oluşturun
2. GitHub reposunuzu bağlayın
3. Ortam değişkenlerini ekleyin
4. Build komutunu: `npm run build`
5. Çıktı dizini: `dist`

### GitHub Pages
```bash
npm run build
git add dist
git commit -m "Deploy to GitHub Pages"
git push origin main
```

## 📊 Veritabanı Şeması

### teams Tablosu
```sql
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  logo TEXT,
  short_name VARCHAR(10) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### matches Tablosu
```sql
CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  home_team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  time VARCHAR(10),
  league VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'scheduled',
  google_link TEXT,
  broadcast_channel VARCHAR(255),
  home_win_probability DECIMAL(5,2),
  away_win_probability DECIMAL(5,2),
  draw_probability DECIMAL(5,2),
  notified BOOLEAN DEFAULT FALSE,
  voice_room_created BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### roles Tablosu
```sql
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Database View'leri
```sql
-- Yaklaşan maçlar için view
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

-- Bildirim için view
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

-- Sesli oda için view
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
```

## 🔧 API Endpoint'leri

### Maç Senkronizasyonu
```bash
POST /api/syncFixtures
```
Bu endpoint, tüm takımlar için maç verilerini senkronize eder.

## 🤝 Katkıda Bulunma

1. Bu reposunu `fork`layın
2. Yeni bir branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişikliklerinizi yapın (`git commit -m 'Add amazing feature'`)
4. Branch'i pushlayın (`git push origin feature/amazing-feature`)
5. Bir Pull Request oluşturun

## 📝 Lisans

Bu proje ISC lisansı altında dağıtılmaktadır. Daha fazla bilgi için [LICENSE](LICENSE) dosyasına bakın.

## 🙏 Teşekkürler

- [discord.js](https://discord.js.org/) - Discord kütüphanesi
- [Supabase](https://supabase.com/) - Veritabanı hizmeti
- [SerpApi](https://serpapi.com/) - Arama API hizmeti
- [OpenRouter](https://openrouter.ai/) - AI hizmeti

## 📞 İletişim

Sorularınız veya önerileriniz için:
- GitHub Issues üzerinden iletişime geçin
- E-posta: [your-email@example.com](mailto:your-email@example.com)

---

⚽ **Fikstur Botu - Maçları Kaçırma!** ⚽
