export interface Team {
  id: number;
  name: string;
  logo: string;
  short_name: string;
  timestamp?: number; // Optional property for caching
}

export interface Match {
  id: number;
  homeTeam: Team;
  awayTeam: Team;
  date: string; // ISO string format
  time: string;
  league: string;
  status: 'scheduled' | 'in_play' | 'full_time';
  googleLink?: string;
  broadcastChannel?: string;
  homeWinProbability?: number;
  awayWinProbability?: number;
  drawProbability?: number;
  notified?: boolean;
  voice_room_created?: boolean;
}

export interface DiscordRole {
  id: number;
  name: string;
  teamId: number | null; // null for 'barbarlar' role
}

export interface LeagueConfig {
  name: string;
  teams: string[]; // Team names
  serpApiQuery: string;
}

export interface OddsResponse {
  homeWin: number;
  awayWin: number;
  draw: number;
}
