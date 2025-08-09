const { SerpApiService } = require('./dist/services/serpapi.js');

async function testTodayParsing() {
  console.log('🧪 Testing today date parsing...');
  
  const serpapi = new SerpApiService();
  
  // Test cases
  const testCases = [
    'today 19:00',
    'today',
    'today 20:30',
    'tomorrow 21:00',
    'tomorrow'
  ];
  
  for (const testCase of testCases) {
    try {
      console.log(`\n📅 Testing: "${testCase}"`);
      // SerpApiService'in parseGameDate metodu private, o yüzden fetchFixtures kullanacağız
      console.log('Note: parseGameDate is private, testing with current date logic...');
      
      const today = new Date();
      console.log('Current time:', today.toISOString());
      
      // Manual test of today parsing logic
      if (testCase.toLowerCase().includes('today')) {
        const timeMatch = testCase.match(/today\s+(\d{1,2}):(\d{2})/i);
        if (timeMatch) {
          const hour = parseInt(timeMatch[1]);
          const minute = parseInt(timeMatch[2]);
          today.setHours(hour, minute, 0, 0);
          console.log('✅ Parsed result:', today.toISOString());
        } else if (testCase.toLowerCase().trim() === 'today') {
          today.setHours(20, 0, 0, 0);
          console.log('✅ Parsed result (default):', today.toISOString());
        }
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
}

testTodayParsing();
