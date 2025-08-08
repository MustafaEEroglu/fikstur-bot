import { DiscordClient } from './client';

// Create and start the Discord bot only in non-serverless environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const client = new DiscordClient();
  client.start();
  console.log('🤖 Discord bot yerel modda başlatıldı');
} else {
  console.log('🚀 Serverless modda çalışıyoruz, bot /api/bot endpoint üzerinden yönetilecek');
}

// Export for Vercel serverless function
export default async function handler(_req: any, res: any) {
  // This endpoint is used by UptimeRobot to keep the bot alive
  res.status(200).json({ 
    message: 'Bot endpoint active!',
    environment: process.env.NODE_ENV,
    isVercel: !!process.env.VERCEL,
    timestamp: new Date().toISOString()
  });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
