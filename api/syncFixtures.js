// Load environment variables
require('dotenv').config();

async function handler(req, res) {
  try {
    console.log('🔄 Fixture sync başlatılıyor...');
    
    // Import sync function dynamically to avoid startup issues
    const syncModule = require('../dist/syncFixtures');
    const syncService = new syncModule.FixtureSyncService();
    
    await syncService.syncAllFixtures();
    
    console.log('✅ Fixture sync tamamlandı');
    
    res.status(200).json({ 
      message: 'Fixtures synced successfully!',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Fixture sync hatası:', error);
    res.status(500).json({ 
      error: 'Sync failed', 
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = handler;
