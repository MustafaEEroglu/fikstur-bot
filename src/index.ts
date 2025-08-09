import { DiscordClient } from './client';
import { app, PORT } from './healthcheck';

// HTTP server başlat (Render için)
app.listen(PORT, () => {
  console.log(`🌐 HTTP server çalışıyor: http://localhost:${PORT}`);
});

// Create and start the Discord bot
const client = new DiscordClient();
client.start();
console.log('🤖 Discord bot başlatıldı');

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
