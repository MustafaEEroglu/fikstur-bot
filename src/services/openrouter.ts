import OpenAI from 'openai';
import { config } from '../utils/config';
import { OddsResponse } from '../types';

export class OpenRouterService {
  private openai: OpenAI;
  private oddsCache = new Map<string, { odds: OddsResponse; timestamp: number }>();
  private cacheTimeout = 30 * 60 * 1000; // 30 dakika

  constructor() {
    this.openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: config.openrouter.apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://fikstur-bot.vercel.app", // Replace with your app URL
        "X-Title": "Fikstur Discord Bot", // Replace with your app name
      },
    });
  }

  async getMatchOdds(homeTeam: string, awayTeam: string): Promise<OddsResponse> {
    // Create cache key
    const cacheKey = `${homeTeam.toLowerCase()}-${awayTeam.toLowerCase()}`;
    
    // Check cache first
    const cached = this.oddsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.odds;
    }

    const prompt = `
You are a football betting expert. Analyze the upcoming match between ${homeTeam} and ${awayTeam} and provide the win probabilities in the following JSON format:
{
  "homeWin": 45,
  "awayWin": 30,
  "draw": 25
}

Please provide realistic percentages that add up to 100. Base your analysis on general team strength, recent form, and typical match outcomes for teams of this caliber. IMPORTANT: Respond with ONLY the JSON object and nothing else. Do not include any markdown formatting, code blocks, or additional text.
`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "deepseek/deepseek-r1:free",
        messages: [
          {
            role: "user",
            content: prompt,
          }
        ],
      });

      const content = completion.choices?.[0]?.message?.content;
      
      if (!content) {
        console.error('OpenRouter API: Yanıt içeriği boş');
        throw new Error('Invalid response from OpenRouter API - content is empty');
      }
      
      let odds: OddsResponse;
      try {
        odds = JSON.parse(content);
      } catch (parseError) {
        console.error('OpenRouter API: JSON parse hatası - Yanıt formatı beklenenden farklı');
        throw new Error('Invalid JSON response from OpenRouter API');
      }
      
      // Ensure percentages add up to 100
      const total = odds.homeWin + odds.awayWin + odds.draw;
      if (Math.abs(total - 100) > 1) {
        // Normalize if they don't add up to 100
        const factor = 100 / total;
        odds.homeWin = Math.round(odds.homeWin * factor);
        odds.awayWin = Math.round(odds.awayWin * factor);
        odds.draw = 100 - odds.homeWin - odds.awayWin;
      }

      // Cache the result
      this.oddsCache.set(cacheKey, {
        odds,
        timestamp: Date.now()
      });

      return odds;
    } catch (error) {
      console.error('Error getting match odds from OpenRouter:', error);
      // Return default odds if API fails
      return {
        homeWin: 33,
        awayWin: 33,
        draw: 34,
      };
    }
  }
}
