import { FixtureSyncService } from '../syncFixtures';

export default async function handler(_req: any, res: any) {
  try {
    console.log('🔄 Starting fixture synchronization...');
    const syncService = new FixtureSyncService();
    await syncService.syncAllFixtures();
    console.log('✅ Fixture synchronization completed successfully!');
    res.status(200).json({ message: 'Fixture synchronization completed successfully!' });
  } catch (error: any) {
    console.error('❌ Sync handler error:', error);
    res.status(500).json({ error: 'Fixture synchronization failed', details: error.message });
  }
}
