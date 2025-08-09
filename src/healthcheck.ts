import express, { Request, Response } from 'express';

// Render için basit HTTP endpoint (UptimeRobot için)
const app = express();
const PORT = process.env.PORT || 10000;

// Health check endpoint (UptimeRobot için)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'healthy',
    service: 'fikstur-discord-bot',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())} seconds`,
    memory: process.memoryUsage(),
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ 
    message: '🤖 Fikstur Discord Bot is running!',
    status: 'online',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      status: '/'
    }
  });
});

// Ping endpoint (alternatif)
app.get('/ping', (_req: Request, res: Response) => {
  res.status(200).send('pong');
});

export { app, PORT };
