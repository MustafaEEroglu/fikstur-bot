import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../utils/config';
import { Match, Team, DiscordRole } from '../types';

export class SupabaseService {
  private client: SupabaseClient;
  private rolesCache: { data: DiscordRole[]; timestamp: number } | null = null;
  private rolesCacheTimeout = 5 * 60 * 1000; // 5 dakika

  constructor() {
    this.client = createClient(config.supabase.url, config.supabase.anonKey);
  }

  // Service role key for admin operations
  private get adminClient(): SupabaseClient {
    return createClient(config.supabase.url, config.supabase.serviceRoleKey);
  }

  // Team operations
  async upsertTeam(team: Omit<Team, 'id'>): Promise<Team> {
    const { data, error } = await this.adminClient
      .from('teams')
      .upsert(team, { onConflict: 'name' })
      .select()
      .single();

    if (error) throw new Error(`Error upserting team: ${error.message}`);
    return data;
  }

  async getTeamByName(name: string): Promise<Team | null> {
    const { data, error } = await this.client
      .from('teams')
      .select('*')
      .eq('name', name)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(`Error fetching team: ${error.message}`);
    return data;
  }

  // Match operations
  async upsertMatch(matchData: {
    home_team_id: number;
    away_team_id: number;
    date: string;
    time: string;
    league: string;
    status: 'scheduled' | 'in_play' | 'full_time';
    google_link?: string;
    broadcast_channel?: string;
    home_win_probability?: number;
    away_win_probability?: number;
    draw_probability?: number;
    notified?: boolean;
    voice_room_created?: boolean;
  }): Promise<Match> {
    // First check if match already exists
    const existingMatch = await this.adminClient
      .from('matches')
      .select('id')
      .eq('home_team_id', matchData.home_team_id)
      .eq('away_team_id', matchData.away_team_id)
      .eq('date', matchData.date)
      .eq('league', matchData.league)
      .single();

    if (existingMatch.data) {
      // Match exists, update it
      const { data, error } = await this.adminClient
        .from('matches')
        .update(matchData)
        .eq('id', existingMatch.data.id)
        .select()
        .single();

      if (error) throw new Error(`Error updating match: ${error.message}`);
      return data;
    } else {
      // Match doesn't exist, insert it
      const { data, error } = await this.adminClient
        .from('matches')
        .insert(matchData)
        .select()
        .single();

      if (error) throw new Error(`Error inserting match: ${error.message}`);
      return data;
    }
  }

  async getMatchesForNotification(): Promise<Match[]> {
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from('matches')
      .select(`
        *,
        homeTeam:teams!home_team_id(id, name, logo, short_name),
        awayTeam:teams!away_team_id(id, name, logo, short_name)
      `)
      .gte('date', now)
      .lte('date', oneHourFromNow)
      .eq('status', 'scheduled')
      .eq('notified', false)
      .order('date', { ascending: true })
      .limit(50); // Limit to prevent large data sets

    if (error) throw new Error(`Error fetching matches for notification: ${error.message}`);
    return data || [];
  }

  async getMatchesForVoiceRoom(): Promise<Match[]> {
    const fifteenMinutesFromNow = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from('matches')
      .select(`
        *,
        homeTeam:teams!home_team_id(id, name, logo, short_name),
        awayTeam:teams!away_team_id(id, name, logo, short_name)
      `)
      .gte('date', now)
      .lte('date', fifteenMinutesFromNow)
      .eq('status', 'scheduled')
      .eq('voice_room_created', false)
      .order('date', { ascending: true })
      .limit(20); // Limit to prevent large data sets

    if (error) throw new Error(`Error fetching matches for voice room: ${error.message}`);
    return data || [];
  }

  async getUpcomingMatches(days: number = 7): Promise<Match[]> {
    const now = new Date().toISOString();
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await this.client
      .from('matches')
      .select(`
        *,
        homeTeam:teams!home_team_id(id, name, logo, short_name),
        awayTeam:teams!away_team_id(id, name, logo, short_name)
      `)
      .gte('date', now)
      .lte('date', futureDate)
      .eq('status', 'scheduled')
      .order('date', { ascending: true })
      .limit(100); // Limit to prevent large data sets

    if (error) throw new Error(`Error fetching upcoming matches: ${error.message}`);
    return data || [];
  }

  async updateMatchStatus(matchId: number, updates: Partial<Match>): Promise<void> {
    const { error } = await this.adminClient
      .from('matches')
      .update(updates)
      .eq('id', matchId);

    if (error) throw new Error(`Error updating match status: ${error.message}`);
  }

  // Role operations
  async getRoles(): Promise<DiscordRole[]> {
    // Check cache first
    if (this.rolesCache && Date.now() - this.rolesCache.timestamp < this.rolesCacheTimeout) {
      return this.rolesCache.data;
    }

    // Fetch from database if not in cache or cache expired
    const { data, error } = await this.client
      .from('roles')
      .select('id, name, team_id'); // Use team_id instead of teamId

    if (error) throw new Error(`Error fetching roles: ${error.message}`);
    
    // Update cache and map team_id to teamId for TypeScript compatibility
    const mappedData = (data || []).map(role => ({
      ...role,
      teamId: role.team_id
    }));
    
    this.rolesCache = {
      data: mappedData,
      timestamp: Date.now()
    };
    
    return mappedData;
  }

  async getRoleByTeamName(teamName: string): Promise<DiscordRole | null> {
    const { data, error } = await this.client
      .from('roles')
      .select('*')
      .or(`name.ilike.%${teamName}%,team_id.in.(select id from teams where name.ilike.%${teamName}%)`)
      .limit(1); // Limit to single result for better performance

    if (error && error.code !== 'PGRST116') throw new Error(`Error fetching role: ${error.message}`);
    return data?.[0] || null;
  }

  async getBarbarRole(): Promise<DiscordRole | null> {
    const { data, error } = await this.client
      .from('roles')
      .select('id, name, team_id')
      .eq('name', 'barbarlar')
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(`Error fetching barbar role: ${error.message}`);
    
    // Map team_id to teamId for TypeScript compatibility
    return data ? { ...data, teamId: data.team_id } : null;
  }
}
