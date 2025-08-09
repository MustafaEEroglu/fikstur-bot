// Timing constants
export const INTERVALS = {
  MATCH_CHECK: 3 * 60 * 1000,       // 3 dakika
  VOICE_ROOM_CLEANUP: 2 * 60 * 60 * 1000, // 2 saat
  TEST_ROOM_CLEANUP: 5 * 60 * 1000,  // 5 dakika
} as const;

// Cache timeouts
export const CACHE_TIMEOUTS = {
  ROLES: 10 * 60 * 1000,     // 10 dakika
  MATCHES: 2 * 60 * 1000,    // 2 dakika
  TEAM_SEARCH: 6 * 60 * 60 * 1000, // 6 saat (48 saatten düşürüldü)
  ODDS: 30 * 60 * 1000,      // 30 dakika (1 saatten düşürüldü)
} as const;

// Default values
export const DEFAULTS = {
  MATCH_TIME: '20:00',
  HOME_WIN_ODDS: 33,
  AWAY_WIN_ODDS: 33,
  DRAW_ODDS: 34,
  LIMIT_MATCHES: 20,
} as const;

// Turkish teams for special handling
export const TURKISH_TEAMS = [
  'galatasaray',
  'fenerbahçe', 
  'beşiktaş'
] as const;

// Error messages
export const ERROR_MESSAGES = {
  MISSING_HOME_TEAM: 'Ev takım bilgisi eksik',
  MISSING_AWAY_TEAM: 'Deplasman takım bilgisi eksik',
  MATCH_EMBED_ERROR: 'Maç bilgisi oluşturulurken hata oluştu',
  VOICE_ROOM_ERROR: 'Sesli oda bildirimi oluşturulurken hata oluştu',
  GUILD_NOT_FOUND: 'Sunucu bulunamadı',
  CHANNEL_NOT_FOUND: 'Kanal bulunamadı',
} as const;
