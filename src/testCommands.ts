import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { SupabaseService } from './services/supabase';

export const testCommands = [
  new SlashCommandBuilder()
    .setName('test-notification')
    .setDescription('Test maç bildirimi gönderir')
    .toJSON(),
    
  new SlashCommandBuilder()
    .setName('test-voice-room')
    .setDescription('Test sesli oda oluşturur')
    .toJSON(),
    
  new SlashCommandBuilder()
    .setName('list-matches')
    .setDescription('Yaklaşan maçları listeler')
    .toJSON(),
    
  new SlashCommandBuilder()
    .setName('clear-test-data')
    .setDescription('Test verilerini temizler')
    .toJSON(),
];

export async function handleTestCommand(interaction: any, supabase: SupabaseService) {
  const command = interaction.commandName;
  
  try {
    console.log(`🧪 Test komutu tetiklendi: ${command} - Kullanıcı: ${interaction.user.tag}`);
    await interaction.deferReply();
    
    switch (command) {
      case 'test-notification':
        console.log('🧪 Test bildirimi gönderiliyor...');
        // Test bildirimi gönder
        const testMatch = {
          id: 999,
          homeTeam: { name: 'Test Takım A', logo: '', short_name: 'TTA' },
          awayTeam: { name: 'Test Takım B', logo: '', short_name: 'TTB' },
          date: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 dakika sonra
          time: '20:00',
          league: 'Test Lig',
          status: 'scheduled' as const,
          notified: false,
          voice_room_created: false,
        };
        
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('🧪 TEST MAÇ BİLDİRİMİ')
          .setDescription('Bu bir test bildirimidir!')
          .addFields(
            { name: '📅 Tarih', value: '<t:1714864800:t>', inline: true },
            { name: '🏟️ Lig', value: testMatch.league, inline: true },
            { name: '⚽ Maç', value: `${testMatch.homeTeam.name} vs ${testMatch.awayTeam.name}`, inline: true }
          )
          .setFooter({ text: 'Test Modu - Gerçek Bildirim Değil' });
        
        await interaction.editReply({ 
          content: '🧪 **TEST BİLDİRİMİ**',
          embeds: [embed] 
        });
        console.log('✅ Test bildirimi gönderildi');
        break;
        
      case 'test-voice-room':
        console.log('🧪 Test sesli oda oluşturuluyor...');
        // Test sesli oda oluştur
        const guild = interaction.guild;
        if (!guild) {
          await interaction.editReply('Sunucu bulunamadı!');
          return;
        }
        
        const voiceChannel = await guild.channels.create({
          name: '🧪 TEST MAÇ ODASI',
          type: 2, // Voice channel
          reason: 'Test sesli oda',
        });
        
        await voiceChannel.send('🧪 **TEST SESLİ ODA**');
        await voiceChannel.send('Bu bir test odasıdır!');
        
        // 5 dakika sonra otomatik sil
        setTimeout(async () => {
          try {
            await voiceChannel.delete('Test bitti');
          } catch (error) {
            console.log('Test sesli oda zaten silinmiş');
          }
        }, 5 * 60 * 1000);
        
        await interaction.editReply(`🧪 Test sesli oda oluşturuldu: ${voiceChannel}`);
        console.log('✅ Test sesli oda oluşturuldu:', voiceChannel.name);
        break;
        
      case 'list-matches':
        console.log('🧪 Yaklaşan maçlar listeleniyor...');
        // Yaklaşan maçları listele
        const matches = await supabase.getUpcomingMatches(1);
        
        if (matches.length === 0) {
          await interaction.editReply('Yaklaşan maç bulunamadı.');
          return;
        }
        
        const embedList = new EmbedBuilder()
          .setTitle('📅 Yaklaşan Maçlar')
          .setColor('#0099ff')
          .setDescription('Yaklaşan maçlar:')
          .setTimestamp();
        
        let description = '';
        for (const match of matches) {
          const date = new Date(match.date);
          const timeStr = `<t:${Math.floor(date.getTime() / 1000)}:R>`;
          description += `**${match.homeTeam.name} vs ${match.awayTeam.name}**\n`;
          description += `📅 ${timeStr} - 🏟️ ${match.league}\n\n`;
        }
        
        embedList.setDescription(description);
        await interaction.editReply({ embeds: [embedList] });
        console.log('✅ Maç listesi gönderildi, toplam maç sayısı:', matches.length);
        break;
        
      case 'clear-test-data':
        // Test verilerini temizle (bu komut sadece geliştirme ortamında kullanılmalı)
        await interaction.editReply('⚠️ Test verileri temizlenemez - Bu özellik sadece geliştirme ortamında kullanılabilir.');
        break;
        
      default:
        await interaction.editReply('Bilinmeyen komut.');
    }
  } catch (error) {
    console.error('❌ Test komutu hatası:', error);
    await interaction.editReply('Test komutu çalıştırılırken bir hata oluştu.');
  }
}
