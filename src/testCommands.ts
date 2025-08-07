import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';
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
    
    // Daha güvenli hata yönetimi için deferReply kontrolü
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply().catch((deferError: any) => {
        console.log('⚠️ deferReply hatası:', deferError);
      });
    }
    
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
        }).catch((editError: any) => {
          console.log('⚠️ editReply hatası:', editError);
          // Eğer editReply başarısız olursa, yeni bir reply dene
          return interaction.reply({ 
            content: '🧪 **TEST BİLDİRİMİ**',
            embeds: [embed] 
          });
        });
        console.log('✅ Test bildirimi gönderildi');
        break;
        
      case 'test-voice-room':
        console.log('🧪 TEST SESLİ ODA OLUŞTURMA İŞLEMİ BAŞLATILIYOR...');
        console.log('🔍 Kullanıcı:', interaction.user.tag);
        console.log('👤 Kullanıcı ID:', interaction.user.id);
        
        // Test sesli oda oluştur
        const guild = interaction.guild;
        if (!guild) {
          console.log('❌ Sunucu bulunamadı!');
          await interaction.editReply('Sunucu bulunamadı!').catch((editError: any) => {
            console.log('⚠️ editReply hatası:', editError);
            return interaction.reply('Sunucu bulunamadı!');
          });
          return;
        }
        
        console.log('✅ Sunucu bulundu:', guild.name);
        console.log('🏛️ Sunucu ID:', guild.id);
        
        console.log('🚀 Test sesli kanal oluşturma işlemi başlatılıyor...');
        const voiceChannel = await guild.channels.create({
          name: '🧪 TEST MAÇ ODASI',
          type: ChannelType.GuildVoice,
          reason: 'Test sesli oda',
        }).catch((createError: any) => {
          console.log('❌ Kanal oluşturma hatası:', createError);
          throw new Error('Test sesli oda oluşturulamadı');
        });
        
        console.log('✅ Test sesli kanal oluşturuldu:', voiceChannel.name);
        console.log('🆔 Kanal ID:', voiceChannel.id);
        console.log('📍 Kanal tipi:', voiceChannel.type);
        
        // Test için embed bildirim gönder
        console.log('📢 Test bildirimi hazırlanıyor...');
        const testEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🏟️ MAÇ ODASI HAZIR!')
          .setDescription('**Galatasaray vs Fenerbahçe**')
          .addFields(
            { name: '📅 Maç Tarihi', value: '06.08.2025 20:00', inline: true },
            { name: '🏟️ Lig', value: 'Süper Lig', inline: true },
            { name: '📺 Yayın', value: 'TRT Spor', inline: true },
            { name: '🔔 Bildirim', value: '<@&GalatasarayRoluID> Galatasaraylılar! Maç başlıyor!', inline: false }
          )
          .setThumbnail('https://example.com/logo1.png')
          .setImage('https://example.com/logo2.png')
          .setFooter({ text: 'Galatasaray takımını destekleyin!' })
          .setTimestamp();
        
        console.log('📤 Bildirim gönderiliyor...');
        await voiceChannel.send({ embeds: [testEmbed] }).catch((sendError: any) => {
          console.log('⚠️ Bildirim gönderme hatası:', sendError);
        });
        console.log('✅ Test bildirimi başarıyla gönderildi');
        
        // 5 dakika sonra otomatik sil
        console.log('⏰ Otomatik silme zamanlayıcısı ayarlanıyor (5 dakika sonra)...');
        setTimeout(async () => {
          try {
            console.log('🧹 Test sesli oda siliniyor...');
            await voiceChannel.delete('Test bitti');
            console.log('✅ Test sesli oda başarıyla silindi');
          } catch (error) {
            console.log('⚠️ Test sesli oda zaten silinmiş veya silinirken hata oluştu:', error);
          }
        }, 5 * 60 * 1000);
        
        await interaction.editReply(`🧪 Test sesli oda oluşturuldu: ${voiceChannel}`).catch((editError: any) => {
          console.log('⚠️ editReply hatası:', editError);
          return interaction.reply(`🧪 Test sesli oda oluşturuldu: ${voiceChannel}`);
        });
        console.log('✅ Test komutu başarıyla tamamlandı');
        console.log('📋 Oluşturulan kanal bilgileri:');
        console.log(`   - Ad: ${voiceChannel.name}`);
        console.log(`   - ID: ${voiceChannel.id}`);
        console.log(`   - Tip: ${voiceChannel.type}`);
        console.log(`   - Silinecek: 5 dakika sonra`);
        break;
        
      case 'list-matches':
        console.log('🧪 Yaklaşan maçlar listeleniyor...');
        // Yaklaşan maçları listele
        const matches = await supabase.getUpcomingMatches(1);
        
        if (matches.length === 0) {
          await interaction.editReply('Yaklaşan maç bulunamadı.').catch((editError: any) => {
            console.log('⚠️ editReply hatası:', editError);
            return interaction.reply('Yaklaşan maç bulunamadı.');
          });
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
        await interaction.editReply({ embeds: [embedList] }).catch((editError: any) => {
          console.log('⚠️ editReply hatası:', editError);
          return interaction.reply({ embeds: [embedList] });
        });
        console.log('✅ Maç listesi gönderildi, toplam maç sayısı:', matches.length);
        break;
        
      case 'clear-test-data':
        // Test verilerini temizle (bu komut sadece geliştirme ortamında kullanılmalı)
        await interaction.editReply('⚠️ Test verileri temizlenemez - Bu özellik sadece geliştirme ortamında kullanılabilir.').catch((editError: any) => {
          console.log('⚠️ editReply hatası:', editError);
          return interaction.reply('⚠️ Test verileri temizlenemez - Bu özellik sadece geliştirme ortamında kullanılabilir.');
        });
        break;
        
      default:
        await interaction.editReply('Bilinmeyen komut.').catch((editError: any) => {
          console.log('⚠️ editReply hatası:', editError);
          return interaction.reply('Bilinmeyen komut.');
        });
    }
  } catch (error) {
    console.error('❌ Test komutu hatası:', error);
    
    // Daha güvenli hata mesajı gönderme
    try {
      await interaction.editReply('Test komutu çalıştırılırken bir hata oluştu.').catch((editError: any) => {
        console.log('⚠️ Hata mesajı gönderilemedi:', editError);
        return interaction.reply('Test komutu çalıştırılırken bir hata oluştu.');
      });
    } catch (replyError) {
      console.error('❌ Hata mesajı bile gönderilemedi:', replyError);
    }
  }
}
