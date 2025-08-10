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
- **3 saat sonra otomatik oda temizleme** - Maç bitiminde otomatik temizleme
- **Discord Etkinlikleri** - Sesli odalar için Discord etkinlikleri oluşturma
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

## � Deployment (Render.com)

### Render'a Deploy Etme
1. [Render.com](https://render.com/) hesabı oluşturun
2. **"New Web Service"** seçin
3. GitHub repository'nizi bağlayın
4. Ayarları yapın:
   ```
   Name: fikstur-bot
   Build Command: npm install && npm run build
   Start Command: npm start
   Node Version: 18
   ```
5. **Environment Variables** ekleyin (aşağıdaki tüm değişkenler)
6. **Deploy** butonuna tıklayın

### Environment Variables (Render'da eklenecek)
```env
NODE_ENV=production
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_GUILD_ID=your_discord_server_id
DISCORD_FIXTURE_CHANNEL_ID=your_fixture_channel_id
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SERPAPI_API_KEY=your_serpapi_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
```

### Render Avantajları
- ✅ Gerçekten ücretsiz,çok iyi
- ✅ Otomatik SSL sertifikası
- ✅ GitHub auto-deployment
- ✅ Crash recovery
- ✅ Environment variables güvenliği

## �📖 Kullanım

### Komutlar
- `/hafta` - Gelecek 7 günlük maç fikstürünü gösterir

### Otomatik Özellikler
- **Maç Bildirimleri**: Maç başlamadan 1 saat önce otomatik bildirim
- **Sesli Odalar**: Maç başlamadan 15 dakika önce otomatik sesli oda oluşturma
- **Haftalık Kontrol**: Her 5 dakikada bir yeni maçları kontrol etme

## 📊 Veritabanı Şeması

### teams Tablosu
```sql
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  logo TEXT,
  short_name VARCHAR(10) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX idx_teams_name ON teams(name);
```

### matches Tablosu
```sql
CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  home_team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  time VARCHAR(10) NOT NULL,
  league VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_play', 'full_time')),
  google_link TEXT,
  broadcast_channel VARCHAR(255),
  home_win_probability INTEGER DEFAULT 33,
  away_win_probability INTEGER DEFAULT 33,
  draw_probability INTEGER DEFAULT 34,
  notified BOOLEAN DEFAULT FALSE,
  voice_room_created BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_matches_date ON matches(date);
CREATE INDEX idx_matches_notified ON matches(notified) WHERE notified = FALSE;
CREATE INDEX idx_matches_voice_room ON matches(voice_room_created) WHERE voice_room_created = FALSE;
CREATE INDEX idx_matches_teams ON matches(home_team_id, away_team_id);

-- Unique constraint to prevent duplicate matches
CREATE UNIQUE INDEX idx_matches_unique ON matches(home_team_id, away_team_id, date, league);
```

### discord_roles Tablosu
```sql
CREATE TABLE discord_roles (
  id VARCHAR(255) PRIMARY KEY, -- Discord role ID
  name VARCHAR(255) NOT NULL,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX idx_discord_roles_team_id ON discord_roles(team_id);
```
```sql
CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  home_team_id INTEGER REFERENCES teams(id),
  away_team_id INTEGER REFERENCES teams(id),
  date TIMESTAMP NOT NULL,
  time VARCHAR(10) NOT NULL,
  league VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled',
  google_link TEXT,
  broadcast_channel VARCHAR(255),
  home_win_probability INTEGER,
  away_win_probability INTEGER,
  draw_probability INTEGER,
  notified BOOLEAN DEFAULT FALSE,
  voice_room_created BOOLEAN DEFAULT FALSE,
  event_id VARCHAR(255) -- Discord etkinlik ID'si
);
```

### events Tablosu
```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  discord_event_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### roles Tablosu
```sql
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  team_id INTEGER REFERENCES teams(id)
);
```

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
