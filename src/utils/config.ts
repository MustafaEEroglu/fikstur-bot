import dotenv from 'dotenv';

dotenv.config();

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
  process.exit(1);
}
