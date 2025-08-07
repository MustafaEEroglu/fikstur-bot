import { DiscordClient } from './client';

// Create and start the Discord bot
const client = new DiscordClient();

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Export for Vercel serverless function
export default async function handler(_req: any, res: any) {
  // Bot zaten çalışıyor, sadece health check için yanıt ver
  if (client.isReady()) {
    res.status(200).json({ 
      message: 'Bot is running!',
      status: 'online',
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(200).json({ 
      message: 'Bot is starting...',
      status: 'starting',
      timestamp: new Date().toISOString()
    });
  }
}

// Botu başlat
client.start();
