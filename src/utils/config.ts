import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Environment Debug Info:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DISCORD_BOT_TOKEN length:', process.env.DISCORD_BOT_TOKEN?.length || 'undefined');
console.log('DISCORD_BOT_TOKEN first 10 chars:', process.env.DISCORD_BOT_TOKEN?.substring(0, 10) || 'undefined');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');

export const config = {
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
    fixtureChannelId: process.env.DISCORD_FIXTURE_CHANNEL_ID || '',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  serpapi: {
    apiKey: process.env.SERPAPI_API_KEY || '',
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
  },
};

if (!config.discord.botToken || !config.discord.guildId || !config.supabase.url || !config.supabase.anonKey) {
  console.error('Missing required environment variables. Please check your .env file.');
  console.error('Config values:');
  console.error('- botToken length:', config.discord.botToken.length);
  console.error('- guildId:', config.discord.guildId);
  console.error('- supabase url:', config.supabase.url);
  console.error('- supabase anonKey length:', config.supabase.anonKey.length);
  process.exit(1);
}
