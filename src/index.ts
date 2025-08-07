import { DiscordClient } from './client';

// Create and start the Discord bot
const client = new DiscordClient();
client.start();

// Export for Vercel serverless function
export default async function handler(_req: any, res: any) {
  // This endpoint is used by UptimeRobot to keep the bot alive
  res.status(200).json({ message: 'Bot is running!' });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
