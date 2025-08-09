const { SerpApiService } = require('./dist/services/serpapi.js');
const axios = require('axios');

async function debugSerpApi() {
  console.log('🔍 Debugging SerpAPI response...');
  
  try {
    const apiKey = process.env.SERPAPI_KEY;
    const query = 'Arsenal fixtures today';
    
    const params = {
      q: query,
      location: 'Istanbul, Turkey',
      api_key: apiKey,
    };
    
    console.log('📡 Making SerpAPI request with query:', query);
    
    const response = await axios.get('https://serpapi.com/search.json', { params });
    
    console.log('\n📊 Full SerpAPI Response Structure:');
    console.log('Keys:', Object.keys(response.data));
    
    if (response.data.sports_results) {
      console.log('\n🏈 sports_results found:');
      console.log('Keys:', Object.keys(response.data.sports_results));
      
      if (response.data.sports_results.games) {
        console.log('\n⚽ Games found:', response.data.sports_results.games.length);
        response.data.sports_results.games.forEach((game, index) => {
          console.log(`\nGame ${index + 1}:`, {
            date: game.date,
            teams: game.teams || 'No teams',
            status: game.status || 'No status'
          });
        });
      }
    }
    
    if (response.data.knowledge_graph) {
      console.log('\n🧠 knowledge_graph found:');
      console.log('Keys:', Object.keys(response.data.knowledge_graph));
      
      if (response.data.knowledge_graph.games) {
        console.log('\n⚽ Knowledge graph games found:', response.data.knowledge_graph.games.length);
        response.data.knowledge_graph.games.forEach((game, index) => {
          console.log(`\nKG Game ${index + 1}:`, {
            date: game.date,
            teams: game.teams || 'No teams',
            status: game.status || 'No status'
          });
        });
      }
    }
    
    if (response.data.organic_results) {
      console.log('\n🔍 organic_results found:', response.data.organic_results.length);
      response.data.organic_results.slice(0, 3).forEach((result, index) => {
        console.log(`\nOrganic ${index + 1}:`, {
          title: result.title,
          date: result.date,
          snippet: result.snippet?.substring(0, 100) + '...'
        });
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

debugSerpApi();
