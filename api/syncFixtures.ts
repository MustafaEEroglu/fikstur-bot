import { SupabaseService } from '../src/services/supabase';

export default async function handler(req: any, res: any) {
  try {
    console.log('🔄 Fixture sync başlatılıyor...');
    
    // Import sync function dynamically to avoid startup issues
    const syncModule = await import('../src/syncFixtures');
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
