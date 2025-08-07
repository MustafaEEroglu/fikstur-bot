import axios from 'axios';
import { config } from '../utils/config';
import { Match, Team, LeagueConfig } from '../types';

export class SerpApiService {
  private apiKey: string;
  private baseUrl: string = 'https://serpapi.com/search.json';
  private teamCache = new Map<string, Team>();
  private cacheTimeout = 48 * 60 * 60 * 1000; // 48 saat (uzatıldı)
  private requestQueue = new Map<string, Promise<Team | null>>();

  constructor() {
    this.apiKey = config.serpapi.apiKey;
  }

  async fetchFixtures(league: LeagueConfig): Promise<Match[]> {
    const params = {
      q: `${league.serpApiQuery} fixtures`,
      location: 'Istanbul, Turkey',
      api_key: this.apiKey,
    };

    try {
      const response = await axios.get(this.baseUrl, { params });
      
      const matches: Match[] = [];

      // Check for sports_results in the response
      if (response.data.sports_results) {
        // Check games array
        if (response.data.sports_results.games && response.data.sports_results.games.length > 0) {
          for (const game of response.data.sports_results.games) {
            const match = this.parseGame(game, league.name);
            if (match) {
              matches.push(match);
            }
          }
        }
        
        // Check game_spotlight
        if (response.data.sports_results.game_spotlight) {
          const spotlightMatch = this.parseGame(response.data.sports_results.game_spotlight, league.name);
          if (spotlightMatch) {
            matches.push(spotlightMatch);
          }
        }
      }

      // Check organic_results for additional matches
      if (response.data.organic_results && response.data.organic_results.length > 0) {
        for (const result of response.data.organic_results) {
          // Look for match information in organic results
          if (result.title && result.title.toLowerCase().includes('besiktas') && result.title.toLowerCase().includes('2025')) {
            const organicMatch = this.parseOrganicResult(result, league.name);
            if (organicMatch) {
              matches.push(organicMatch);
            }
          }
        }
      }

      return matches;
    } catch (error: any) {
      console.error(`❌ SerpApi hatası: ${league.name} ligi için maçlar alınamadı`, error);
      return [];
    }
  }

  private parseGame(game: any, league: string): Match | null {
    try {
      // Check if teams exist
      if (!game.teams || game.teams.length !== 2) {
        return null;
      }

      const homeTeam = game.teams[0];
      const awayTeam = game.teams[1];

      // Parse date
      const gameDate = this.parseGameDate(game.date);
      if (!gameDate) {
        return null;
      }

      // Add time if available, otherwise use default
      let time = game.time || '20:00';
      
      // Convert 12-hour format to 24-hour format
      if (time.includes('PM') || time.includes('pm')) {
        const cleanTime = time.replace(' PM', '').replace(' pm', '').replace('P.M.', '').replace('p.m.', '');
        const [hour, minute] = cleanTime.split(':');
        let hour24 = parseInt(hour);
        // Düzeltme: 12 PM kontrolü
        if (hour24 !== 12) {
          hour24 += 12;
        }
        time = `${hour24.toString().padStart(2, '0')}:${minute}`;
      } else if (time.includes('AM') || time.includes('am')) {
        const cleanTime = time.replace(' AM', '').replace(' am', '').replace('A.M.', '').replace('a.m.', '');
        const [hour, minute] = cleanTime.split(':');
        let hour24 = parseInt(hour);
        // Düzeltme: 12 AM kontrolü
        if (hour24 === 12) {
          hour24 = 0;
        }
        time = `${hour24.toString().padStart(2, '0')}:${minute}`;
      }
      
      // Ensure time is in HH:MM format
      const timeParts = time.split(':');
      if (timeParts.length === 2) {
        const hour = parseInt(timeParts[0]);
        const minute = parseInt(timeParts[1]);
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
          time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        }
      }
      
      const formattedDate = `${gameDate.getFullYear()}-${String(gameDate.getMonth() + 1).padStart(2, '0')}-${String(gameDate.getDate()).padStart(2, '0')}T${time}:00+03:00`;

      return {
        id: 0,
        homeTeam: {
          id: 0,
          name: homeTeam.name,
          logo: homeTeam.thumbnail || '',
          short_name: homeTeam.name.substring(0, 3).toUpperCase(),
        },
        awayTeam: {
          id: 0,
          name: awayTeam.name,
          logo: awayTeam.thumbnail || '',
          short_name: awayTeam.name.substring(0, 3).toUpperCase(),
        },
        date: formattedDate,
        time: time,
        league: game.tournament || league,
        status: game.status || 'scheduled',
        googleLink: game.video_highlights?.link || '',
        broadcastChannel: game.venue || '',
      };
    } catch (error) {
      console.error('❌ Maç ayrıştırma hatası:', error);
      return null;
    }
  }

  private parseOrganicResult(result: any, league: string): Match | null {
    try {
      // Extract team names from title
      const title = result.title.toLowerCase();
      
      // Look for team names in the title
      const teams = [];
      if (title.includes('besiktas')) {
        teams.push('Beşiktaş');
      }
      if (title.includes('st patrick')) {
        teams.push('St Patrick\'s Athletic');
      }
      
      if (teams.length !== 2) {
        return null;
      }
      
      // Parse date from snippet or title
      const dateMatch = result.snippet?.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/) || 
                       result.title?.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      
      if (!dateMatch) {
        return null;
      }
      
      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]);
      const year = parseInt(dateMatch[3]);
      
      const gameDate = new Date(year, month - 1, day);
      
      // Parse time from snippet
      const timeMatch = result.snippet?.match(/(\d{1,2}):(\d{2})\s*(?:am|pm|AM|PM)/i) ||
                       result.snippet?.match(/(\d{1,2}):(\d{2})/);
      
      let time = '20:00';
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        const minute = parseInt(timeMatch[2]);
        
        // Düzeltme: 12 saat formatı dönüşümü
        if (timeMatch[0].toLowerCase().includes('pm')) {
          if (hour !== 12) {
            hour += 12;
          }
        } else if (timeMatch[0].toLowerCase().includes('am')) {
          if (hour === 12) {
            hour = 0;
          }
        }
        
        time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      }
      
      const formattedDate = `${gameDate.getFullYear()}-${String(gameDate.getMonth() + 1).padStart(2, '0')}-${String(gameDate.getDate()).padStart(2, '0')}T${time}:00+03:00`;
      
      return {
        id: 0,
        homeTeam: {
          id: 0,
          name: teams[0],
          logo: '',
          short_name: teams[0].substring(0, 3).toUpperCase(),
        },
        awayTeam: {
          id: 0,
          name: teams[1],
          logo: '',
          short_name: teams[1].substring(0, 3).toUpperCase(),
        },
        date: formattedDate,
        time: time,
        league: league,
        status: 'scheduled',
        googleLink: '',
        broadcastChannel: '',
      };
    } catch (error) {
      console.error('❌ Organik sonuç ayrıştırma hatası:', error);
      return null;
    }
  }

  private parseGameDate(dateStr: string): Date | null {
    try {
      if (!dateStr) {
        return null;
      }
      
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Handle "today, HH:MM XM" format
      const todayTimeMatch = dateStr.toLowerCase().match(/today,\s*(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (todayTimeMatch) {
        let hour = parseInt(todayTimeMatch[1]);
        const minute = parseInt(todayTimeMatch[2]);
        const period = todayTimeMatch[3].toUpperCase();
        
        // Düzeltme: 12 PM kontrolü
        if (period === 'PM') {
          if (hour !== 12) {
            hour += 12;
          }
        } else if (period === 'AM') {
          if (hour === 12) {
            hour = 0;
          }
        }
        
        today.setHours(hour, minute, 0, 0);
        return today;
      }
      
      // Handle "tomorrow, HH:MM XM" format
      const tomorrowTimeMatch = dateStr.toLowerCase().match(/tomorrow,\s*(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (tomorrowTimeMatch) {
        let hour = parseInt(tomorrowTimeMatch[1]);
        const minute = parseInt(tomorrowTimeMatch[2]);
        const period = tomorrowTimeMatch[3].toUpperCase();
        
        // Düzeltme: 12 PM kontrolü
        if (period === 'PM') {
          if (hour !== 12) {
            hour += 12;
          }
        } else if (period === 'AM') {
          if (hour === 12) {
            hour = 0;
          }
        }
        
        tomorrow.setHours(hour, minute, 0, 0);
        return tomorrow;
      }
      
      // Handle simple "today" and "tomorrow" - SAAT BİLGİSİ OLMADAN DEĞİL!
      if (dateStr.toLowerCase() === 'today') {
        // Bugün ama saat bilgisi varsa onu kullan
        return today;
      }
      
      if (dateStr.toLowerCase() === 'tomorrow') {
        // Yarın ama saat bilgisi varsa onu kullan
        return tomorrow;
      }
      
      // Handle date formats with dots: "06.08.2025" or "06.08.25"
      if (dateStr.includes('.')) {
        const parts = dateStr.split('.');
        if (parts.length === 3) {
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]);
          const year = parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
          
          const parsedDate = new Date(year, month - 1, day);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ Tarih ayrıştırma hatası:', error);
      return null;
    }
  }

  async searchTeam(teamName: string): Promise<Team | null> {
    // Check cache first
    const cached = this.teamCache.get(teamName.toLowerCase());
    if (cached && cached.timestamp && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached;
    }

    // Check if request is already in progress
    const cacheKey = teamName.toLowerCase();
    if (this.requestQueue.has(cacheKey)) {
      return this.requestQueue.get(cacheKey)!;
    }

    const requestPromise = this.makeTeamSearchRequest(cacheKey, teamName);
    this.requestQueue.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      this.requestQueue.delete(cacheKey);
    }
  }

  private async makeTeamSearchRequest(cacheKey: string, teamName: string): Promise<Team | null> {
    const params = {
      q: `${teamName} football club`,
      location: 'Istanbul, Turkey',
      api_key: this.apiKey,
    };

    try {
      const response = await axios.get(this.baseUrl, { params });
      
      if (response.data.sports_results) {
        const team: Team & { timestamp: number } = {
          id: 0,
          name: teamName,
          logo: response.data.sports_results.thumbnail || '',
          short_name: teamName.substring(0, 3).toUpperCase(),
          timestamp: Date.now()
        };
        
        // Cache the result
        this.teamCache.set(cacheKey, team);
        
        return team;
      }
      return null;
    } catch (error) {
      console.error(`❌ Takım bilgisi alınamadı: ${teamName}`, error);
      return null;
    }
  }
}
