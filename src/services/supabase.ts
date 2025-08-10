import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../utils/config';
import { Match, Team, DiscordRole } from '../types';
import { CACHE_TIMEOUTS, DEFAULTS } from '../utils/constants';

export class SupabaseService {
  private client: SupabaseClient;
  private rolesCache: { data: DiscordRole[]; timestamp: number } | null = null;
  private rolesCacheTimeout = CACHE_TIMEOUTS.ROLES;
  private matchesCache = new Map<string, { matches: Match[]; timestamp: number }>();
  private matchesCacheTimeout = CACHE_TIMEOUTS.MATCHES;

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
    console.log(`🔄 Upserting match: ${matchData.home_team_id} vs ${matchData.away_team_id} on ${matchData.date} ${matchData.time}`);
    
    try {
      // � GERÇEK UNIQUE CONSTRAINT: (home_team_id, away_team_id, date, league) - TIME YOK!
      const { data: existingMatches, error: searchError } = await this.adminClient
        .from('matches')
        .select('id')
        .eq('home_team_id', matchData.home_team_id)
        .eq('away_team_id', matchData.away_team_id)
        .eq('date', matchData.date)
        .eq('league', matchData.league);
        // ⚠️ TIME ALANI UNIQUE CONSTRAINT'TE YOK - ARAMA YAPARKEN DE KULLANMIYORUZ!

      if (searchError) {
        console.error(`❌ Search error:`, searchError);
        throw new Error(`Error searching for existing match: ${searchError.message}`);
      }

      if (existingMatches && existingMatches.length > 0) {
        // 🔄 Maç mevcut, güncelle (TIME güncellenebilir)
        const existingId = existingMatches[0].id;
        console.log(`🔄 Updating existing match ID: ${existingId} (Constraint: home:${matchData.home_team_id} vs away:${matchData.away_team_id}, date:${matchData.date}, league:${matchData.league})`);
        
        const { data, error } = await this.adminClient
          .from('matches')
          .update(matchData)
          .eq('id', existingId)
          .select()
          .single();

        if (error) {
          console.error(`❌ Update error:`, error);
          throw new Error(`Error updating match: ${error.message}`);
        }
        
        console.log(`✅ Match updated successfully: ${data.id} (Time may have changed: ${matchData.time})`);
        return data;
      } else {
        // ➕ Yeni maç, ekle
        console.log(`➕ Inserting new match (Unique: home:${matchData.home_team_id} vs away:${matchData.away_team_id}, date:${matchData.date}, league:${matchData.league}, time:${matchData.time})`);
        
        const { data, error } = await this.adminClient
          .from('matches')
          .insert(matchData)
          .select()
          .single();

        if (error) {
          console.error(`❌ Insert error:`, error);
          
          // Son çare: Constraint violation olursa force update dene
          if (error.code === '23505') {
            console.log(`🔄 Duplicate detected, trying force update...`);
            const { data: forceUpdateData, error: forceError } = await this.adminClient
              .from('matches')
              .update(matchData)
              .eq('home_team_id', matchData.home_team_id)
              .eq('away_team_id', matchData.away_team_id)
              .eq('date', matchData.date)
              .eq('league', matchData.league)
              .select()
              .single();
              
            if (forceError) {
              throw new Error(`Error in force update: ${forceError.message}`);
            }
            console.log(`✅ Force update successful: ${forceUpdateData.id}`);
            return forceUpdateData;
          }
          
          throw new Error(`Error inserting match: ${error.message}`);
        }
        
        console.log(`✅ Match inserted successfully: ${data.id}`);
        return data;
      }
    } catch (error) {
      console.error(`❌ Critical upsert error for match ${matchData.home_team_id} vs ${matchData.away_team_id}:`, error);
      throw error;
    }
  }

  // 🧹 TÜM MAÇLARI TEMİZLE (Her sync'te kullanılacak)
  async clearAllMatches(): Promise<void> {
    const { error } = await this.adminClient
      .from('matches')
      .delete()
      .neq('id', 0); // Delete all records

    if (error) throw new Error(`Error clearing matches: ${error.message}`);
    
    // Clear cache after deletion
    this.matchesCache.clear();
    console.log('✅ All matches cleared from database and cache');
  }

  async getMatchesForNotification(): Promise<Match[]> {
    const cacheKey = 'matches-for-notification';
    const cached = this.matchesCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.matchesCacheTimeout) {
      return cached.matches;
    }
    
    // 🇹🇷 TÜRKİYE SAATİ (UTC+3) ile hesaplama
    const now = new Date();
    const turkeyTime = new Date(now.getTime() + (3 * 60 * 60 * 1000)); // UTC+3
    
    // 1 saat sonrası (bildirim zamanı)
    const oneHourFromNow = new Date(turkeyTime.getTime() + 60 * 60 * 1000).toISOString();
    // 50 dakika sonrası (pencere başlangıcı)
    const fiftyMinutesFromNow = new Date(turkeyTime.getTime() + 50 * 60 * 1000).toISOString();

    console.log(`🔍 🇹🇷 Turkey time notification window: ${fiftyMinutesFromNow} to ${oneHourFromNow}`);

    const { data, error } = await this.client
      .from('matches')
      .select(`
        *,
        homeTeam:teams!home_team_id(id, name, logo, short_name),
        awayTeam:teams!away_team_id(id, name, logo, short_name)
      `)
      .gte('date', fiftyMinutesFromNow)   // 50 dakika sonrası
      .lte('date', oneHourFromNow)        // 1 saat sonrası  
      .eq('status', 'scheduled')
      .eq('notified', false)
      .order('date', { ascending: true })
      .limit(50);

    console.log(`📊 Found ${data?.length || 0} matches needing notification`);

    if (error) throw new Error(`Error fetching matches for notification: ${error.message}`);
    
    // Cache the result
    this.matchesCache.set(cacheKey, {
      matches: data || [],
      timestamp: Date.now()
    });
    
    return data || [];
  }

  async getMatchesForVoiceRoom(): Promise<Match[]> {
    const cacheKey = 'matches-for-voice-room';
    const cached = this.matchesCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.matchesCacheTimeout) {
      return cached.matches;
    }
    
    // 🇹🇷 TÜRKİYE SAATİ (UTC+3) ile hesaplama
    const now = new Date();
    const turkeyTime = new Date(now.getTime() + (3 * 60 * 60 * 1000)); // UTC+3
    
    const fifteenMinutesFromNow = new Date(turkeyTime.getTime() + 15 * 60 * 1000).toISOString();
    const turkeyNow = turkeyTime.toISOString();

    console.log(`🔍 🇹🇷 Turkey time voice room window: ${turkeyNow} to ${fifteenMinutesFromNow}`);

    const { data, error } = await this.client
      .from('matches')
      .select(`
        *,
        homeTeam:teams!home_team_id(id, name, logo, short_name),
        awayTeam:teams!away_team_id(id, name, logo, short_name)
      `)
      .gte('date', turkeyNow)
      .lte('date', fifteenMinutesFromNow)
      .eq('status', 'scheduled')
      .eq('voice_room_created', false)
      .order('date', { ascending: true })
      .limit(DEFAULTS.LIMIT_MATCHES); // Limit to prevent large data sets

    if (error) throw new Error(`Error fetching matches for voice room: ${error.message}`);
    
    // Cache the result
    this.matchesCache.set(cacheKey, {
      matches: data || [],
      timestamp: Date.now()
    });
    
    return data || [];
  }

  async getUpcomingMatches(days: number = 7): Promise<Match[]> {
    const cacheKey = `upcoming-matches-${days}`;
    const cached = this.matchesCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.matchesCacheTimeout) {
      return cached.matches;
    }
    
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
    
    // Cache the result
    this.matchesCache.set(cacheKey, {
      matches: data || [],
      timestamp: Date.now()
    });
    
    return data || [];
  }

  async updateMatchStatus(matchId: number, updates: Partial<Match>): Promise<void> {
    const { error } = await this.adminClient
      .from('matches')
      .update(updates)
      .eq('id', matchId);

    if (error) throw new Error(`Error updating match status: ${error.message}`);
    
    // Cache'i temizle
    this.matchesCache.clear();
    this.rolesCache = null;
  }

  // Role operations
  async getRoles(): Promise<DiscordRole[]> {
    // Check cache first
    if (this.rolesCache && Date.now() - this.rolesCache.timestamp < this.rolesCacheTimeout) {
      return this.rolesCache.data;
    }

    // Fetch from database if not in cache or cache expired
    const { data, error } = await this.client
      .from('discord_roles')
      .select('id, name, team_id'); // Updated table name

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

  async getBarbarRole(): Promise<DiscordRole | null> {
    const { data, error } = await this.client
      .from('discord_roles')
      .select('id, name, team_id')
      .eq('name', 'barbarlar')
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(`Error fetching barbar role: ${error.message}`);
    
    // Map team_id to teamId for TypeScript compatibility
    return data ? { ...data, teamId: data.team_id } : null;
  }

  // 🧹 Postponed maçları zaten veritabanına yazmıyoruz, temizleme gereksiz
  async cleanPostponedMatches(): Promise<number> {
    console.log('🧹 Postponed matches are already filtered before database insertion. No cleaning needed.');
    return 0;
  }
}
