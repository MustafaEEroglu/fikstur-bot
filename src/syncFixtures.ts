import { SupabaseService } from './services/supabase';
import { SerpApiService } from './services/serpapi';
import { OpenRouterService } from './services/openrouter';
import { LeagueConfig } from './types';

class FixtureSyncService {
  private supabase: SupabaseService;
  private serpapi: SerpApiService;
  private openrouter: OpenRouterService;

  constructor() {
    this.supabase = new SupabaseService();
    this.serpapi = new SerpApiService();
    this.openrouter = new OpenRouterService();
  }

  async syncAllFixtures() {
    console.log('Starting fixture synchronization...');
    
    const teamConfigs: LeagueConfig[] = [
      { name: 'Galatasaray', teams: ['Galatasaray'], serpApiQuery: 'Galatasaray' },
      { name: 'Fenerbahçe', teams: ['Fenerbahçe'], serpApiQuery: 'Fenerbahçe' },
      { name: 'Beşiktaş', teams: ['Beşiktaş'], serpApiQuery: 'Beşiktaş' },
      { name: 'Liverpool', teams: ['Liverpool'], serpApiQuery: 'Liverpool' },
      { name: 'Chelsea', teams: ['Chelsea'], serpApiQuery: 'Chelsea' },
      { name: 'Arsenal', teams: ['Arsenal'], serpApiQuery: 'Arsenal' },
      { name: 'Manchester United', teams: ['Manchester United'], serpApiQuery: 'Manchester United' },
      { name: 'Manchester City', teams: ['Manchester City'], serpApiQuery: 'Manchester City' },
      { name: 'Real Madrid', teams: ['Real Madrid'], serpApiQuery: 'Real Madrid' },
      { name: 'Barcelona', teams: ['Barcelona'], serpApiQuery: 'Barcelona' },
    ];

    try {
      // Queue ile paralel senkronizasyon
      const syncPromises = teamConfigs.map(async (team) => {
        console.log(`🔄 Syncing fixtures for ${team.name}...`);
        try {
          await this.syncLeagueFixtures(team);
          console.log(`✅ Successfully synced fixtures for ${team.name}`);
        } catch (error) {
          console.error(`❌ Error syncing fixtures for ${team.name}:`, error);
          throw error;
        }
      });
      
      // Paralel olarak çalıştır
      await Promise.all(syncPromises);
      
      console.log('🎉 Fixture synchronization completed successfully!');
    } catch (error) {
      console.error('❌ Error during fixture synchronization:', error);
      throw error;
    }
  }

  private async syncLeagueFixtures(league: LeagueConfig) {
    try {
      // Fetch fixtures from SerpApi
      const matches = await this.serpapi.fetchFixtures(league);
      console.log(`Found ${matches.length} matches for ${league.name}`);

      for (const match of matches) {
        // Check if teams exist in database, create if not
        const homeTeam = await this.ensureTeam(match.homeTeam);
        const awayTeam = await this.ensureTeam(match.awayTeam);

        // Get odds for the match
        const odds = await this.openrouter.getMatchOdds(homeTeam.name, awayTeam.name);

        // Prepare match data for database
        const matchData = {
          home_team_id: homeTeam.id,
          away_team_id: awayTeam.id,
          date: match.date,
          time: match.time,
          league: match.league,
          status: match.status,
          google_link: match.googleLink || undefined,
          broadcast_channel: match.broadcastChannel || undefined,
          home_win_probability: odds.homeWin,
          away_win_probability: odds.awayWin,
          draw_probability: odds.draw,
          notified: false,
          voice_room_created: false,
        };

        // Upsert match to database
        await this.supabase.upsertMatch(matchData);
      }
    } catch (error) {
      console.error(`Error syncing fixtures for ${league.name}:`, error);
      throw error;
    }
  }

  private async ensureTeam(team: any): Promise<any> {
    // Check if team exists in database
    let dbTeam = await this.supabase.getTeamByName(team.name);

    if (!dbTeam) {
      // If not, create team with logo from SerpApi
      const teamWithLogo = await this.serpapi.searchTeam(team.name);
      
      if (teamWithLogo) {
        dbTeam = await this.supabase.upsertTeam({
          name: teamWithLogo.name,
          logo: teamWithLogo.logo,
          short_name: teamWithLogo.short_name,
        });
        console.log(`Created new team: ${dbTeam.name}`);
      } else {
        // Fallback to basic team info if logo search fails
        dbTeam = await this.supabase.upsertTeam({
          name: team.name,
          logo: team.logo || '',
          short_name: team.short_name || team.name.substring(0, 3).toUpperCase(),
        });
        console.log(`Created new team (no logo): ${dbTeam.name}`);
      }
    }

    return dbTeam;
  }
}

// Export class for use in API
export { FixtureSyncService };
