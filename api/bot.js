// Load environment variables
require('dotenv').config();

const path = require('path');
const clientPath = path.join(__dirname, '..', 'dist', 'client.js');
const DiscordClient = require(clientPath).default;

// Global bot instance for Hobby plan optimization
let globalClient = null;
let isStarting = false;
let lastActivity = Date.now();

async function handler(req, res) {
  try {
    // Update last activity for keep-alive
    lastActivity = Date.now();
    
    // Bot zaten çalışıyorsa status döndür
    if (globalClient && globalClient.readyAt) {
      const uptime = globalClient.uptime ? Math.floor(globalClient.uptime / 1000) : 0;
      return res.status(200).json({ 
        message: 'Bot is running!', 
        status: 'online',
        readyAt: globalClient.readyAt,
        ping: globalClient.ws.ping,
        guilds: globalClient.guilds.cache.size,
        uptime: `${uptime}s`,
        lastActivity: new Date(lastActivity).toISOString(),
        memory: process.memoryUsage()
      });
    }

    // Bot başlatılıyorsa bekleme durumu
    if (isStarting) {
      return res.status(202).json({ 
        message: 'Bot is starting, please wait...', 
        status: 'starting',
        timestamp: new Date().toISOString()
      });
    }

    // Bot çalışmıyorsa başlat
    if (!globalClient) {
      isStarting = true;
      console.log('🤖 Discord bot başlatılıyor...');
      
      try {
        globalClient = new DiscordClient();
        
        // Bot ready olduğunda log
        globalClient.once('ready', () => {
          console.log(`✅ Discord bot ${globalClient?.user?.tag} olarak giriş yaptı!`);
          isStarting = false;
        });

        // Bot error durumunda handle et
        globalClient.on('error', (error) => {
          console.error('❌ Discord bot hatası:', error);
        });

        // Bot disconnect olursa yeniden bağlan
        globalClient.on('disconnect', () => {
          console.log('⚠️ Discord bot bağlantısı kesildi, yeniden bağlanıyor...');
          globalClient = null;
          isStarting = false;
        });

        // Bot warning durumunda handle et
        globalClient.on('warn', (warning) => {
          console.warn('⚠️ Discord bot uyarısı:', warning);
        });

        await globalClient.start();
        
        // Başlatma süreci tamamlandı
        isStarting = false;
        
      } catch (error) {
        console.error('Bot başlatma hatası:', error);
        globalClient = null;
        isStarting = false;
        throw error;
      }
    }

    // Response
    res.status(200).json({ 
      message: 'Bot startup initiated', 
      status: 'connecting',
      timestamp: new Date().toISOString(),
      isStarting
    });

  } catch (error) {
    console.error('Bot endpoint hatası:', error);
    isStarting = false;
    res.status(500).json({ 
      error: 'Bot başlatılamadı', 
      details: error instanceof Error ? error.message : 'Bilinmeyen hata',
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = handler;
