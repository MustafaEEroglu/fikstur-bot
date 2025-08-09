const { FixtureSyncService } = require('./dist/syncFixtures.js');

async function testSync() {
  console.log('🔄 Testing fixture sync...');
  
  try {
    const syncService = new FixtureSyncService();
    
    // Test Arsenal sync specifically (since user mentioned Arsenal match today)
    console.log('🎯 Testing Arsenal fixtures sync...');
    
    const arsenalConfig = { 
      name: 'Arsenal', 
      teams: ['Arsenal'], 
      serpApiQuery: 'Arsenal' 
    };
    
    await syncService.syncLeagueFixtures(arsenalConfig);
    
    console.log('✅ Arsenal sync completed!');
    
  } catch (error) {
    console.error('❌ Sync error:', error.message);
  }
}

testSync();
