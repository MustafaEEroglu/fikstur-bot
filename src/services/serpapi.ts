import axios from 'axios';
import { config } from '../utils/config';
import { Match, Team, LeagueConfig } from '../types';
import { addDays } from 'date-fns';
import { CACHE_TIMEOUTS, DEFAULTS } from '../utils/constants';

export class SerpApiService {
  private apiKey: string;
  private baseUrl: string = 'https://serpapi.com/search.json';
  private teamCache = new Map<string, Team>();
  private cacheTimeout = CACHE_TIMEOUTS.TEAM_SEARCH;
  private requestQueue = new Map<string, Promise<Team | null>>();

  constructor() {
    this.apiKey = config.serpapi.apiKey;
  }

  async fetchFixtures(leagueConfig: LeagueConfig): Promise<Match[]> {
    const today = new Date();
    const nextWeek = addDays(today, 7);
    
    // Use the correct sports results engine as per SerpApi documentation
    const params = {
      q: `${leagueConfig.serpApiQuery} fixtures`,
      location: 'Istanbul, Turkey',
      api_key: this.apiKey,
    };

    try {
      const response = await axios.get(this.baseUrl, { params });
      const matches: Match[] = [];

      // Check for sports_results in the response
      if (response.data.sports_results && response.data.sports_results.games) {
        for (const game of response.data.sports_results.games) {
          // Parse the date from the game
          const gameDate = this.parseGameDate(game.date);
          if (gameDate && gameDate >= today && gameDate <= nextWeek) {
            const match = this.parseGame(game, leagueConfig.name);
            if (match) {
              matches.push(match);
            }
          }
        }
      }

      // Check for knowledge_graph in the response (alternative location for game data)
      if (response.data.knowledge_graph && response.data.knowledge_graph.games) {
        console.log(`📋 Found ${response.data.knowledge_graph.games.length} games in knowledge_graph.games`);
        for (const game of response.data.knowledge_graph.games) {
          const gameDate = this.parseGameDate(game.date);
          console.log(`📅 Parsing knowledge_graph date: "${game.date}" -> ${gameDate ? gameDate.toISOString() : 'null'}`);
          if (gameDate && gameDate >= today && gameDate <= nextWeek) {
            const match = this.parseGame(game, leagueConfig.name);
            if (match) {
              matches.push(match);
              console.log(`✅ Added match from knowledge_graph: ${match.homeTeam.name} vs ${match.awayTeam.name} at ${match.date}`);
            }
          }
        }
      }

      // Check for organic_results in the response (another possible location)
      if (response.data.organic_results) {
        for (const result of response.data.organic_results) {
          // Look for result that contains match information
          if (result.title && result.title.toLowerCase().includes('vs') && result.date) {
            const gameDate = this.parseGameDate(result.date);
            console.log(`📅 Parsing organic_result date: "${result.date}" -> ${gameDate ? gameDate.toISOString() : 'null'}`);
            if (gameDate && gameDate >= today && gameDate <= nextWeek) {
              const match = this.parseOrganicResult(result, leagueConfig.name);
              if (match) {
                matches.push(match);
                console.log(`✅ Added match from organic_results: ${match.homeTeam.name} vs ${match.awayTeam.name} at ${match.date}`);
              }
            }
          }
        }
      }

      console.log(`🎯 Total matches found for ${leagueConfig.name}: ${matches.length}`);
      return matches;
    } catch (error: any) {
      console.error(`Error fetching fixtures for ${leagueConfig.name}:`, error);
      if (error.response) {
        console.error('SerpApi Error Response:', error.response.data);
      }
      return [];
    }
  }

  private parseGameDate(dateStr: string): Date | null {
    try {
      // Check if dateStr is undefined or null
      if (!dateStr) {
        return null;
      }
      
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // 1. Handle "today, HH:MM XM" format
      const todayTimeMatch = dateStr.toLowerCase().match(/today,\s*(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (todayTimeMatch) {
        let hour = parseInt(todayTimeMatch[1]);
        const minute = parseInt(todayTimeMatch[2]);
        const period = todayTimeMatch[3].toUpperCase();
        
        if (period === 'PM' && hour !== 12) {
          hour += 12;
        } else if (period === 'AM' && hour === 12) {
          hour = 0;
        }
        
        today.setHours(hour, minute, 0, 0);
        return today;
      }
      
      // 1a. Handle "today HH:MM XM" format (virgül olmadan)
      const todayTimeMatchNoComma = dateStr.toLowerCase().match(/today\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (todayTimeMatchNoComma) {
        let hour = parseInt(todayTimeMatchNoComma[1]);
        const minute = parseInt(todayTimeMatchNoComma[2]);
        const period = todayTimeMatchNoComma[3].toUpperCase();
        
        if (period === 'PM' && hour !== 12) {
          hour += 12;
        } else if (period === 'AM' && hour === 12) {
          hour = 0;
        }
        
        today.setHours(hour, minute, 0, 0);
        return today;
      }
      
      // 1b. Handle "today HH:XX" format (AM/PM olmadan)
      const todayTimeMatch24 = dateStr.toLowerCase().match(/today\s+(\d{1,2}):(\d{2})/i);
      if (todayTimeMatch24) {
        const hour = parseInt(todayTimeMatch24[1]);
        const minute = parseInt(todayTimeMatch24[2]);
        
        today.setHours(hour, minute, 0, 0);
        return today;
      }
      
      // 2. Handle "tomorrow, HH:MM XM" format
      const tomorrowTimeMatch = dateStr.toLowerCase().match(/tomorrow,\s*(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (tomorrowTimeMatch) {
        let hour = parseInt(tomorrowTimeMatch[1]);
        const minute = parseInt(tomorrowTimeMatch[2]);
        const period = tomorrowTimeMatch[3].toUpperCase();
        
        if (period === 'PM' && hour !== 12) {
          hour += 12;
        } else if (period === 'AM' && hour === 12) {
          hour = 0;
        }
        
        tomorrow.setHours(hour, minute, 0, 0);
        return tomorrow;
      }
      
      // 3. Handle simple "today" and "tomorrow"
      if (dateStr.toLowerCase() === 'today') {
        return today;
      }
      
      if (dateStr.toLowerCase() === 'tomorrow') {
        return tomorrow;
      }
      
      // 4. Handle postponed matches
      if (dateStr.toLowerCase().includes('postponed') || dateStr.toLowerCase().includes('ertelendi')) {
        return today;
      }
      
      // 5. Handle matches with no specific time yet
      if (dateStr.toLowerCase().includes('henüz belirlenmedi') || 
          dateStr.toLowerCase().includes('tba') || 
          dateStr.toLowerCase().includes('tbd') ||
          dateStr.toLowerCase().includes('time tba') ||
          dateStr.toLowerCase().includes('time tbd')) {
        return today;
      }
      
      // 6. Handle date formats with dots: "06.08.2025" or "06.08.25"
      if (dateStr.includes('.')) {
        const parts = dateStr.split('.');
        if (parts.length >= 3) {
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]);
          let year = parts[2];
          
          // Handle 2-digit year
          if (year.length === 2) {
            const currentYear = today.getFullYear();
            const currentCentury = Math.floor(currentYear / 100) * 100;
            year = (currentCentury + parseInt(year)).toString();
          }
          
          return new Date(parseInt(year), month - 1, day);
        }
      }
      
      // 7. Handle various month-day formats
      const monthDayPatterns = [
        // "Aug 24", "Aug 24, 2025", "24 Aug", "24 Aug, 2025"
        /(\w+)\s+(\d{1,2})(?:,\s*(\d{4}))?/i,
        /(\d{1,2})\s+(\w+)(?:,\s*(\d{4}))?/i,
        // "August 24", "August 24, 2025", "24 August", "24 August, 2025"
        /(\w{3,})\s+(\d{1,2})(?:,\s*(\d{4}))?/i,
        /(\d{1,2})\s+(\w{3,})(?:,\s*(\d{4}))?/i,
      ];
      
      for (const pattern of monthDayPatterns) {
        const match = dateStr.match(pattern);
        if (match) {
          let monthName, day, year;
          
          if (match[1].match(/^\d+$/)) {
            // Day first format: "24 Aug"
            day = parseInt(match[1]);
            monthName = match[2];
            year = match[3] || today.getFullYear().toString();
          } else {
            // Month first format: "Aug 24"
            monthName = match[1];
            day = parseInt(match[2]);
            year = match[3] || today.getFullYear().toString();
          }
          
          const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
          return new Date(parseInt(year), monthIndex, day);
        }
      }
      
      // 8. Handle "Fri, Aug 8" or "Friday, Aug 8" format
      const dayMonthYearPattern = /(?:\w+,\s*)?(\w+)\s+(\d{1,2})(?:,\s*(\d{4}))?/i;
      const dayMonthYearMatch = dateStr.match(dayMonthYearPattern);
      if (dayMonthYearMatch) {
        const monthName = dayMonthYearMatch[1];
        const day = parseInt(dayMonthYearMatch[2]);
        const year = dayMonthYearMatch[3] || today.getFullYear().toString();
        
        const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
        return new Date(parseInt(year), monthIndex, day);
      }
      
      // 9. Handle numeric formats like "08/06/2025" or "08-06-2025"
      const numericPatterns = [
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // MM/DD/YYYY or MM-DD-YYYY
        /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY/MM/DD or YYYY-MM-DD
      ];
      
      for (const pattern of numericPatterns) {
        const match = dateStr.match(pattern);
        if (match) {
          let year, month, day;
          
          if (match[1].length === 4) {
            // YYYY/MM/DD format
            year = parseInt(match[1]);
            month = parseInt(match[2]);
            day = parseInt(match[3]);
          } else {
            // MM/DD/YYYY format
            month = parseInt(match[1]);
            day = parseInt(match[2]);
            year = parseInt(match[3]);
          }
          
          return new Date(year, month - 1, day);
        }
      }
      
      // 10. Handle relative dates like "in 2 days", "next week"
      const relativePatterns = [
        /in\s+(\d+)\s+days?/i,
        /(\d+)\s+days?\s+from\s+now/i,
        /next\s+week/i,
        /this\s+weekend/i,
      ];
      
      for (const pattern of relativePatterns) {
        const match = dateStr.match(pattern);
        if (match) {
          let daysToAdd = 0;
          
          if (match[1]) {
            daysToAdd = parseInt(match[1]);
          } else if (match[0].toLowerCase().includes('next week')) {
            daysToAdd = 7;
          } else if (match[0].toLowerCase().includes('this weekend')) {
            // Add days to reach next Saturday/Sunday
            const daysUntilWeekend = (6 - today.getDay() + 7) % 7;
            daysToAdd = daysUntilWeekend || 7;
          }
          
          const resultDate = new Date(today);
          resultDate.setDate(today.getDate() + daysToAdd);
          return resultDate;
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  private parseOrganicResult(result: any, league: string): Match | null {
    try {
      // Extract team names from title
      const title = result.title || '';
      const vsMatch = title.match(/(.+?)\s+vs\s+(.+?)(?:\s+-\s+.+)?$/i);
      
      if (!vsMatch) return null;
      
      const homeTeamName = vsMatch[1].trim();
      const awayTeamName = vsMatch[2].trim();
      
      // Parse date
      const gameDate = this.parseGameDate(result.date);
      if (!gameDate) return null;
      
      // Use default time if not specified
      let time = DEFAULTS.MATCH_TIME;
      
      // Format date
      const formattedDate = `${gameDate.getFullYear()}-${String(gameDate.getMonth() + 1).padStart(2, '0')}-${String(gameDate.getDate()).padStart(2, '0')}T${time}:00+03:00`;

      return {
        id: 0,
        homeTeam: {
          id: 0,
          name: homeTeamName,
          logo: '',
          short_name: homeTeamName.substring(0, 3).toUpperCase(),
        },
        awayTeam: {
          id: 0,
          name: awayTeamName,
          logo: '',
          short_name: awayTeamName.substring(0, 3).toUpperCase(),
        },
        date: formattedDate,
        time: time,
        league: league,
        status: 'scheduled',
        googleLink: '',
        broadcastChannel: '',
      };
    } catch (error) {
      console.error('Error parsing organic result:', error);
      return null;
    }
  }

  private parseGame(game: any, league: string): Match | null {
    try {
      if (!game.teams || game.teams.length !== 2) {
        return null;
      }

      const homeTeam = game.teams[0];
      const awayTeam = game.teams[1];

      // Parse date and time
      const gameDate = this.parseGameDate(game.date);
      if (!gameDate) return null;

      // Add time if available, otherwise use default
      let time = game.time || DEFAULTS.MATCH_TIME; // Default time if not specified
      
      // Convert 12-hour format to 24-hour format
      if (time.includes('PM') || time.includes('pm')) {
        const cleanTime = time.replace(' PM', '').replace(' pm', '').replace('P.M.', '').replace('p.m.', '');
        const [hour, minute] = cleanTime.split(':');
        let hour24 = parseInt(hour);
        if (hour24 !== 12) {
          hour24 += 12;
        }
        time = `${hour24.toString().padStart(2, '0')}:${minute}`;
      } else if (time.includes('AM') || time.includes('am')) {
        const cleanTime = time.replace(' AM', '').replace(' am').replace('A.M.', '').replace('a.m.', '');
        const [hour, minute] = cleanTime.split(':');
        let hour24 = parseInt(hour);
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
      console.error('Error parsing game:', error);
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
      return await requestPromise;
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
      console.error(`Error searching for team ${teamName}:`, error);
      return null;
    }
  }
}
