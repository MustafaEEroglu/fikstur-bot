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
          const gameDate = this.parseGameDate(game.date);
          if (gameDate && gameDate >= today && gameDate <= nextWeek) {
            const match = this.parseGame(game, leagueConfig.name);
            if (match) {
              matches.push(match);
            }
          }
        }
      }

      // Check for sports_results.game_spotlight (bugünün maçı için)
      if (response.data.sports_results && response.data.sports_results.game_spotlight) {
        const spotlight = response.data.sports_results.game_spotlight;
        const gameDate = this.parseGameDate(spotlight.date);
        
        if (gameDate && gameDate >= today && gameDate <= nextWeek) {
          const match = this.parseSpotlightGame(spotlight, leagueConfig.name);
          if (match) {
            matches.push(match);
          }
        }
      }

      // Check for knowledge_graph in the response (alternative location for game data)
      if (response.data.knowledge_graph && response.data.knowledge_graph.games) {
        for (const game of response.data.knowledge_graph.games) {
          const gameDate = this.parseGameDate(game.date);
          if (gameDate && gameDate >= today && gameDate <= nextWeek) {
            const match = this.parseGame(game, leagueConfig.name);
            if (match) {
              matches.push(match);
            }
          }
        }
      }

      console.log(` Total matches found for ${leagueConfig.name}: ${matches.length}`);
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
        
        if (period === 'PM' && hour !== 12) {
          hour += 12;
        } else if (period === 'AM' && hour === 12) {
          hour = 0;
        }
        
        today.setHours(hour, minute, 0, 0);
        return today;
      }
      
      // Handle "today HH:MM XM" format (virgül olmadan)
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
      
      // Handle "today HH:XX" format (AM/PM olmadan)
      const todayTimeMatch24 = dateStr.toLowerCase().match(/today\s+(\d{1,2}):(\d{2})/i);
      if (todayTimeMatch24) {
        const hour = parseInt(todayTimeMatch24[1]);
        const minute = parseInt(todayTimeMatch24[2]);
        
        today.setHours(hour, minute, 0, 0);
        return today;
      }
      
      // Handle sadece "today" format
      if (dateStr.toLowerCase().trim() === 'today') {
        today.setHours(20, 0, 0, 0); // Default 20:00
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
      
      // 6. Handle relative dates FIRST (before month-day patterns)
      const relativePatterns = [
        /in\s+(\d+)\s+hours?/i,
        /in\s+(\d+)\s+days?/i,
        /(\d+)\s+days?\s+from\s+now/i,
        /(\d+)\s+hours?\s+ago/i,
        /(\d+)\s+minutes?\s+ago/i,
        /(\d+)\s+days?\s+ago/i,
        /next\s+week/i,
        /this\s+weekend/i,
      ];
      
      for (const pattern of relativePatterns) {
        const match = dateStr.match(pattern);
        if (match) {
          console.log('🔍 parseGameDate: Found relative pattern:', match);
          let hoursToAdd = 0;
          let daysToAdd = 0;
          
          if (match[0].toLowerCase().includes('hours ago')) {
            // "X hours ago" means it happened in the past, skip it
            console.log('⚠️ parseGameDate: Skipping past event (hours ago)');
            return null;
          } else if (match[0].toLowerCase().includes('minutes ago')) {
            // "X minutes ago" means it happened in the past, skip it
            console.log('⚠️ parseGameDate: Skipping past event (minutes ago)');
            return null;
          } else if (match[0].toLowerCase().includes('days ago')) {
            // "X days ago" means it happened in the past, skip it
            console.log('⚠️ parseGameDate: Skipping past event (days ago)');
            return null;
          } else if (match[0].toLowerCase().includes('in') && match[0].toLowerCase().includes('hours')) {
            // "in X hours" means it will happen in the future
            hoursToAdd = parseInt(match[1]);
            console.log('✅ parseGameDate: Future event in', hoursToAdd, 'hours');
          } else if (match[0].toLowerCase().includes('in') && match[0].toLowerCase().includes('days')) {
            // "in X days" means it will happen in the future
            daysToAdd = parseInt(match[1]);
            console.log('✅ parseGameDate: Future event in', daysToAdd, 'days');
          } else if (match[1]) {
            daysToAdd = parseInt(match[1]);
          } else if (match[0].toLowerCase().includes('next week')) {
            daysToAdd = 7;
          } else if (match[0].toLowerCase().includes('this weekend')) {
            // Add days to reach next Saturday/Sunday
            const daysUntilWeekend = (6 - today.getDay() + 7) % 7;
            daysToAdd = daysUntilWeekend || 7;
          }
          
          const resultDate = new Date(today);
          if (hoursToAdd > 0) {
            resultDate.setHours(today.getHours() + hoursToAdd);
          }
          if (daysToAdd > 0) {
            resultDate.setDate(today.getDate() + daysToAdd);
          }
          console.log('✅ parseGameDate: Successfully parsed relative date:', resultDate.toISOString());
          return resultDate;
        }
      }

      // 7. Handle date formats with dots: "06.08.2025" or "06.08.25"
      if (dateStr.includes('.')) {
        console.log('🔍 parseGameDate: Found dot format, parsing:', dateStr);
        const parts = dateStr.split('.');
        if (parts.length >= 3) {
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]);
          let year = parts[2];
          
          console.log('🔍 parseGameDate: Parsed parts - day:', day, 'month:', month, 'year:', year);
          
          // Handle 2-digit year
          if (year.length === 2) {
            const currentYear = today.getFullYear();
            const currentCentury = Math.floor(currentYear / 100) * 100;
            year = (currentCentury + parseInt(year)).toString();
          }
          
          console.log('🔍 parseGameDate: Final values - day:', day, 'month:', month-1, 'year:', parseInt(year));
          
          // Validate date values before creating Date object
          if (isNaN(day) || isNaN(month) || isNaN(parseInt(year)) || 
              day < 1 || day > 31 || month < 1 || month > 12) {
            console.log('❌ parseGameDate: Invalid date values');
            return null;
          }
          
          const parsedDate = new Date(parseInt(year), month - 1, day);
          console.log('✅ parseGameDate: Successfully parsed date:', parsedDate.toISOString());
          return parsedDate;
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
          console.log('🔍 parseGameDate: Found month-day pattern:', match);
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
          
          console.log('🔍 parseGameDate: Trying to parse month:', monthName);
          
          try {
            const testDate = new Date(`${monthName} 1, ${year}`);
            if (isNaN(testDate.getTime())) {
              console.log('❌ parseGameDate: Invalid month name:', monthName);
              continue;
            }
            const monthIndex = testDate.getMonth();
            const finalDate = new Date(parseInt(year), monthIndex, day);
            console.log('✅ parseGameDate: Successfully parsed month-day date:', finalDate.toISOString());
            return finalDate;
          } catch (error: any) {
            console.log('❌ parseGameDate: Error parsing month-day:', error.message);
            continue;
          }
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
      
      // 10. Son çare: Tarih parse edilemedi
      console.log(`❌ parseGameDate: Hiçbir format eşleşmedi! Date string: "${dateStr}"`);
      console.log(`❌ parseGameDate: Desteklenen formatlar:`);
      console.log(`   - "today", "today 19:00", "today, 7:00 PM"`);
      console.log(`   - "tomorrow", "tomorrow 19:00", "tomorrow, 7:00 PM"`);
      console.log(`   - "Aug 9", "9 Aug", "August 9"`);
      console.log(`   - "09.08.2025", "09.08.25"`);
      console.log(`   - "08/09/2025", "08-09-2025"`);
      
      return null;
    } catch (error: any) {
      console.log('❌ parseGameDate: General error:', error.message, 'for dateStr:', JSON.stringify(dateStr));
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
      
      console.log('🔍 parseGame: Original time from SerpApi:', time);
      
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
      
      console.log('🔍 parseGame: Processed time:', time);
      
      // TIMEZONE CORRECTION: Google often shows UTC or wrong timezone times
      // Turkish Super League and Turkish teams typically play at 19:00, 20:00, 21:00, 21:30
      // Conference League typically at 21:00, 21:45
      let correctedTime = time;
      
      // If time looks suspicious (like 09:30 for Turkish football), correct it
      if (time === '09:30' && (homeTeam.name.includes('Galatasaray') || awayTeam.name.includes('Galatasaray') || 
                               homeTeam.name.includes('Gaziantep') || awayTeam.name.includes('Gaziantep') ||
                               league.toLowerCase().includes('süper') || league.toLowerCase().includes('turkish'))) {
        correctedTime = '21:30';
        console.log('⚠️ parseGame: Corrected Turkish Super League time from', time, 'to', correctedTime);
      }
      
      // Conference League matches typically at 21:00 or 21:45
      if ((time === '18:45' || time === '19:00') && 
          (league.toLowerCase().includes('conference') || league.toLowerCase().includes('uefa'))) {
        correctedTime = '21:45';
        console.log('⚠️ parseGame: Corrected Conference League time from', time, 'to', correctedTime);
      }
      
      const formattedDate = `${gameDate.getFullYear()}-${String(gameDate.getMonth() + 1).padStart(2, '0')}-${String(gameDate.getDate()).padStart(2, '0')}T${correctedTime}:00+03:00`;

      console.log('✅ parseGame: Final formatted date:', formattedDate);

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
        time: correctedTime,
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

  private parseSpotlightGame(spotlight: any, league: string): Match | null {
    try {
      if (!spotlight.teams || spotlight.teams.length !== 2) {
        return null;
      }

      const [homeTeam, awayTeam] = spotlight.teams;
      
      if (!homeTeam || !awayTeam) {
        return null;
      }

      const gameDate = this.parseGameDate(spotlight.date);
      if (!gameDate) {
        return null;
      }

      // Parse time if available
      let time = spotlight.time || DEFAULTS.MATCH_TIME;

      // Handle time formats like "7:00 PM"
      if (time && typeof time === 'string') {
        const timeMatch = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (timeMatch) {
          let hour = parseInt(timeMatch[1]);
          const minute = timeMatch[2];
          const period = timeMatch[3].toUpperCase();
          
          if (period === 'PM' && hour !== 12) {
            hour += 12;
          } else if (period === 'AM' && hour === 12) {
            hour = 0;
          }
          
          time = `${hour.toString().padStart(2, '0')}:${minute}`;
        }
      }

      // Set date with time
      const [hour, minute] = time.split(':').map(Number);
      gameDate.setHours(hour, minute, 0, 0);
      const formattedDate = gameDate.toISOString();

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
        league: spotlight.league || league,
        status: 'scheduled',
        googleLink: '',
        broadcastChannel: spotlight.stadium || spotlight.venue || '',
      };
    } catch (error) {
      console.error('Error parsing spotlight game:', error);
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
