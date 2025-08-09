import { SupabaseService } from './services/supabase';
import { SerpApiService } from './services/serpapi';
import { OpenRouterService } from './services/openrouter';
import { LeagueConfig } from './types';

export class FixtureSyncService {
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
    
    // 🧹 İLK ÖNCE VERİTABANINI TEMİZLE!
    console.log('🧹 Clearing all existing matches before sync...');
    await this.supabase.clearAllMatches();
    console.log('✅ All matches cleared from database');
    
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
        try {
          await this.syncLeagueFixtures(team);
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
      console.log(`🔄 [${league.name}] senkronizasyonu başlıyor...`);
      
      // Fetch fixtures from SerpApi
      const matches = await this.serpapi.fetchFixtures(league);
      console.log(`📊 [${league.name}] SerpAPI'den ${matches.length} maç alındı`);

      if (matches.length === 0) {
        console.log(`⚠️ [${league.name}] için hiç maç bulunamadı, sync atlanıyor`);
        return;
      }

      // 🚫 ERTELENMİŞ MAÇLARI FİLTRELE!
      console.log(`🔍 [${league.name}] Ertelenen maçlar kontrol ediliyor...`);
      let validMatchCount = 0;
      let postponedMatchCount = 0;

      for (const match of matches) {
        // Ertelenen maç kontrolü
        const isPostponed = this.isPostponedMatch(match);
        
        if (isPostponed) {
          console.log(`🚫 [POSTPONED] Atlanıyor: ${match.homeTeam.name} vs ${match.awayTeam.name} - ${match.status}`);
          postponedMatchCount++;
          continue;
        }

        console.log(`🏟️ [VALID] İşleniyor: ${match.homeTeam.name} vs ${match.awayTeam.name} (${match.date})`);
        validMatchCount++;
        
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

        console.log(`💾 Veritabanına kaydediliyor: ${homeTeam.name} vs ${awayTeam.name}`);
        // Upsert match to database
        await this.supabase.upsertMatch(matchData);
        console.log(`✅ Başarıyla kaydedildi: ${homeTeam.name} vs ${awayTeam.name}`);
      }
      
      console.log(`🎉 [${league.name}] senkronizasyonu tamamlandı! ${validMatchCount} geçerli maç, ${postponedMatchCount} ertelenen maç işlendi.`);
    } catch (error) {
      console.error(`❌ [${league.name}] senkronizasyonu hatası:`, error);
      throw error;
    }
  }

  // 🚫 ERTELENEN MAÇ KONTROLÜ (serpapi.ts'ten kopyalandı)
  private isPostponedMatch(match: any): boolean {
    const postponedPatterns = [
      'postponed', 'ertelendi', 'delayed', 'cancelled', 'canceled', 
      'suspended', 'abandoned', 'called off', 'rescheduled',
      'iptal', 'askıya alındı', 'ileri tarihe ertelendi',
      'maç ertelendi', 'oyun ertelendi', 'karşılaşma ertelendi',
      'vs postponed', 'vs ertelendi', 'vs cancelled',
      'match postponed', 'fixture postponed', 'game postponed',
      'vs delayed', 'vs suspended', 'vs abandoned',
      'vs called off', 'vs rescheduled', 'vs iptal',
      'tarihi değişti', 'tarih belli değil', 'tarih belirsiz'
    ];

    // Status kontrolü
    if (match.status) {
      const statusLower = match.status.toLowerCase();
      if (postponedPatterns.some(pattern => statusLower.includes(pattern))) {
        return true;
      }
    }

    // Tarih kontrolü
    if (match.date) {
      const dateLower = match.date.toLowerCase();
      if (postponedPatterns.some(pattern => dateLower.includes(pattern))) {
        return true;
      }
    }

    // Takım adı kontrolü
    const homeTeamLower = match.homeTeam?.name?.toLowerCase() || '';
    const awayTeamLower = match.awayTeam?.name?.toLowerCase() || '';
    
    if (postponedPatterns.some(pattern => 
      homeTeamLower.includes(pattern) || awayTeamLower.includes(pattern)
    )) {
      return true;
    }

    return false;
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

// Main function - Sync çalıştırıldığında bu çalışacak
async function main() {
  const syncService = new FixtureSyncService();
  try {
    await syncService.syncAllFixtures();
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

// Eğer bu dosya doğrudan çalıştırılırsa main function'ı çağır
if (require.main === module) {
  main();
}
