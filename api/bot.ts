import { DiscordClient } from '../src/client';

// Global bot instance for Hobby plan optimization
let globalClient: DiscordClient | null = null;
let isStarting = false;
let lastActivity = Date.now();

export default async function handler(req: any, res: any) {
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

// Keep-alive mechanism for Hobby plan
const KEEP_ALIVE_INTERVAL = 25 * 60 * 1000; // 25 dakika (Vercel timeout 30dk)

// Inactivity cleanup
setInterval(() => {
  const now = Date.now();
  const inactiveTime = now - lastActivity;
  
  // 1 saattir activity yoksa ve bot varsa temizle
  if (inactiveTime > 60 * 60 * 1000 && globalClient) {
    console.log('🧹 Bot 1 saattir kullanılmadığı için temizleniyor...');
    if (globalClient.destroy) {
      globalClient.destroy();
    }
    globalClient = null;
    isStarting = false;
  }
}, KEEP_ALIVE_INTERVAL);
