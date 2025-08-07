import { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, VoiceChannel } from 'discord.js';
import { config } from './utils/config';
import { SupabaseService } from './services/supabase';
import { OpenRouterService } from './services/openrouter';
import { Match } from './types';
import { format } from 'date-fns';
import { testCommands, handleTestCommand } from './testCommands';

export class DiscordClient extends Client {
  public commands: Collection<string, any> = new Collection();
  public supabase: SupabaseService;
  public openrouter: OpenRouterService;
  private voiceChannels: Set<string> = new Set();

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.supabase = new SupabaseService();
    this.openrouter = new OpenRouterService();
    this.setupCommands();
    this.setupEventHandlers();
  }

  private setupCommands() {
    const commands = [
      new SlashCommandBuilder()
        .setName('hafta')
        .setDescription('Gelecek 7 günün maç fikstürünü gösterir')
        .toJSON(),
      ...testCommands,
    ];

    const rest = new REST({ version: '10' }).setToken(config.discord.botToken);

    (async () => {
      try {
        console.log('Started refreshing application (/) commands.');
        console.log('📋 Komutlar:', commands.map(c => c.name).join(', '));
        await rest.put(
          Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
          { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
      } catch (error) {
        console.error(error);
      }
    })();
  }

  private setupEventHandlers() {
    this.on('ready', () => {
      console.log(`Logged in as ${this.user?.tag}!`);
      this.scheduleTasks();
    });

    this.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = interaction.commandName;
      console.log(`🔔 Komut tetiklendi: ${command} - Kullanıcı: ${interaction.user.tag}`);
      
      if (command === 'hafta') {
        await this.handleWeekCommand(interaction);
      } else if (['test-notification', 'test-voice-room', 'list-matches', 'clear-test-data'].includes(command)) {
        await handleTestCommand(interaction, this.supabase);
      }
    });
  }

  private scheduleTasks() {
    // Check for matches every 3 minutes (daha sık kontrol)
    setInterval(async () => {
      await Promise.all([
        this.checkForMatches(),
        this.checkForVoiceRooms()
      ]);
    }, 3 * 60 * 1000);

    // Initial check
    (async () => {
      await Promise.all([
        this.checkForMatches(),
        this.checkForVoiceRooms()
      ]);
    })();
  }

  private async checkForMatches() {
    try {
      console.log('🔍 Bildirim için maç kontrolü başlatılıyor...');
      const matches = await this.supabase.getMatchesForNotification();
      
      if (matches.length === 0) {
        console.log('⏭️ Bildirim için yeni maç bulunamadı');
        return;
      }
      
      console.log(`📢 ${matches.length} adet maç için bildirim gönderilecek`);
      
      const channel = this.channels.cache.get(config.discord.fixtureChannelId) as any;
      if (!channel) {
        console.error('❌ Fixture kanalı bulunamadı');
        return;
      }

      // Paralel işlem için Promise.all kullan
      await Promise.all(matches.map(async (match) => {
        try {
          console.log(`📝 Maç işleniyor: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
          const role = await this.getRoleForMatch(match);
          const embed = await this.createMatchEmbed(match);
          
          await channel.send({
            content: role ? `${role} Maç Bildirimi!` : '🚨 Yeni Maç Bildirimi!',
            embeds: [embed],
            components: [this.createGoogleButton(match.googleLink)],
          });

          // Update only the notified status, not voice_room_created
          await this.supabase.updateMatchStatus(match.id, { notified: true });
          console.log(`✅ Maç bildirimi gönderildi ve durumu güncellendi: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
        } catch (error) {
          console.error(`❌ Maç işlenirken hata oluştu ${match.id}:`, error);
        }
      }));
    } catch (error) {
      console.error('❌ Maç kontrolü sırasında hata oluştu:', error);
    }
  }

  private async checkForVoiceRooms() {
    try {
      console.log('🔊 Sesli oda kontrolü başlatılıyor...');
      const matches = await this.supabase.getMatchesForVoiceRoom();
      
      if (matches.length === 0) {
        console.log('⏭️ Sesli oda için yeni maç bulunamadı');
        return;
      }
      
      console.log(`📢 ${matches.length} adet maç için sesli oda kontrolü yapılacak`);
      
      // Check if a voice room already exists for any of these matches
      const existingRoom = this.voiceChannels.values().next().value;
      if (existingRoom) {
        console.log(`🔄 Mevcut sesli oda bulunuyor, bildirim gönderilecek: ${existingRoom}`);
        // Send notification in existing room
        const channel = this.channels.cache.get(existingRoom) as VoiceChannel;
        if (channel) {
          // Sadece bir bildirim gönder
          const firstMatch = matches[0];
          const embed = await this.createVoiceRoomNotification(firstMatch);
          await channel.send({ embeds: [embed] });
          console.log(`✅ Mevcut odaya bildirim gönderildi: ${firstMatch.homeTeam.name} vs ${firstMatch.awayTeam.name}`);
        }
        return;
      }

      // Create new voice room if none exists
      const guild = this.guilds.cache.get(config.discord.guildId);
      if (!guild) {
        console.error('❌ Sunucu bulunamadı, sesli oda oluşturulamadı');
        return;
      }

      console.log(`🏗️ Yeni sesli oda oluşturma başlatılıyor...`);
      console.log(`📊 Toplam maç sayısı: ${matches.length}`);
      console.log(`🎯 İlk maç: ${matches[0].homeTeam.name} vs ${matches[0].awayTeam.name}`);

      // Create informative channel name with team abbreviations
      const firstMatch = matches[0];
      const homeTeamAbbr = firstMatch.homeTeam.short_name || firstMatch.homeTeam.name.substring(0, 3).toUpperCase();
      const awayTeamAbbr = firstMatch.homeTeam.short_name || firstMatch.homeTeam.name.substring(0, 3).toUpperCase();
      const leagueName = firstMatch.league.replace(/[^a-zA-Z0-9şğüıöçŞĞÜİÖÇ\s]/g, '').substring(0, 15);
      
      const channelName = `🏟️ ${homeTeamAbbr} vs ${awayTeamAbbr} | ${leagueName}`;
      console.log(`🏷️ Oluşturulacak kanal adı: ${channelName}`);
      
      // Get the highest position among voice channels to place new channel at the top
      const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice);
      const highestPosition = voiceChannels.size > 0 ? 
        Math.max(...voiceChannels.map(c => c.position)) + 1 : 0;
      console.log(`📏 Sesli kanal pozisyonu: ${highestPosition}, Toplam mevcut sesli kanal: ${voiceChannels.size}`);

      console.log(`🚀 Kanal oluşturma işlemi başlatılıyor...`);
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        reason: 'Match starting soon',
        position: highestPosition, // Place at the top
      });
      console.log(`✅ Sesli kanal başarıyla oluşturuldu: ${channel.name} (ID: ${channel.id})`);

      this.voiceChannels.add(channel.id);
      console.log(`📝 Sesli kanal ID'si takip listesine eklendi: ${channel.id}`);

      // Sadece bir bildirim gönder
      console.log(`📢 Sesli kanala bildirim gönderiliyor...`);
      const embed = await this.createVoiceRoomNotification(firstMatch);
      await channel.send({ embeds: [embed] });
      console.log(`✅ Bildirim başarıyla gönderildi`);


      // Tüm maçlar için voice_room_created durumunu güncelle
      await Promise.all(matches.map(async (match) => {
        try {
          await this.supabase.updateMatchStatus(match.id, { voice_room_created: true });
          console.log(`✅ Sesli oda durumu güncellendi: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
        } catch (error) {
          console.error(`❌ Sesli oda durumu güncellenirken hata oluştu ${match.id}:`, error);
        }
      }));

      // Schedule room cleanup (120 minutes after the first match time)
      const cleanupTime = new Date(firstMatch.date);
      cleanupTime.setHours(cleanupTime.getHours() + 2);
      
      const cleanupTimeout = cleanupTime.getTime() - Date.now();
      if (cleanupTimeout > 0) {
        console.log(`⏰ Sesli oda silme zamanı ayarlandı: ${cleanupTimeout / 1000 / 60} dakika sonra`);
        setTimeout(async () => {
          try {
            if (channel.deletable) {
              await channel.delete();
              this.voiceChannels.delete(channel.id);
              console.log(`🧹 Sesli oda temizlendi: ${channel.name}`);
            }
          } catch (error) {
            console.error(`❌ Sesli oda temizlenirken hata oluştu: ${error}`);
          }
        }, cleanupTimeout);
      } else {
        console.log('⚠️ Temizleme zamanı geçmiş, oda hemen siliniyor');
        try {
          if (channel.deletable) {
            await channel.delete();
            this.voiceChannels.delete(channel.id);
            console.log(`✅ Oda hemen silindi: ${channel.name}`);
          }
        } catch (error) {
          console.error(`❌ Hemen silme sırasında hata oluştu: ${error}`);
        }
      }
    } catch (error) {
      console.error('❌ Sesli oda kontrolü sırasında hata oluştu:', error);
    }
  }

  private async handleWeekCommand(interaction: any) {
    try {
      console.log(`📅 Haftalık maç fikstürü komutu tetiklendi: ${interaction.user.tag}`);
      await interaction.deferReply();

      const matches = await this.supabase.getUpcomingMatches(7);
      if (matches.length === 0) {
        console.log('⏭️ Haftalık maç bulunamadı');
        await interaction.editReply('Bu hafta için maç bulunamadı.');
        return;
      }

      console.log(`📊 ${matches.length} adet maç listelenecek`);
      
      const embed = new EmbedBuilder()
        .setTitle('📅 Haftalık Maç Fikstürü')
        .setColor('#0099ff')
        .setDescription('Gelecek 7 gündeki maçlar')
        .setTimestamp();

      let description = '';
      for (const match of matches) {
        const date = format(new Date(match.date), 'dd.MM.yyyy HH:mm');
        description += `**${match.homeTeam.name} vs ${match.awayTeam.name}**\n`;
        description += `📅 ${date} - 🏟️ ${match.league}\n\n`;
      }

      embed.setDescription(description);
      await interaction.editReply({ embeds: [embed] });
      console.log(`✅ Haftalık maç listesi başarıyla gönderildi: ${interaction.user.tag}`);
    } catch (error) {
      console.error('❌ Haftalık maç listesi alınırken hata oluştu:', error);
      await interaction.editReply('Haç listesi alınırken bir hata oluştu.');
    }
  }

  private async createMatchEmbed(match: Match): Promise<EmbedBuilder> {
    // Check if teams exist before accessing their properties
    if (!match.homeTeam || !match.homeTeam.name) {
      console.error('❌ Ev takım bilgisi eksik veya geçersiz:', match.homeTeam);
      return this.createErrorEmbed('Ev takım bilgisi eksik');
    }
    
    if (!match.awayTeam || !match.awayTeam.name) {
      console.error('❌ Deplasman takım bilgisi eksik veya geçersiz:', match.awayTeam);
      return this.createErrorEmbed('Deplasman takım bilgisi eksik');
    }

    try {
      console.log(`🎲 Maç oranları alınıyor: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      const odds = await this.openrouter.getMatchOdds(match.homeTeam.name, match.awayTeam.name);
      
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`⚽ ${match.homeTeam.name} vs ${match.awayTeam.name}`)
        .setThumbnail(match.homeTeam.logo || '')
        .addFields(
          { name: '📅 Tarih', value: format(new Date(match.date), 'dd.MM.yyyy HH:mm'), inline: true },
          { name: '🏟️ Lig', value: match.league || 'Bilinmiyor', inline: true },
          { name: '📺 Yayın', value: match.broadcastChannel || 'Bilinmiyor', inline: true },
          { 
            name: '🎲 Kazanma Oranları', 
            value: `🔴 ${match.homeTeam.name}: ${odds.homeWin}%\n🔵 ${match.awayTeam.name}: ${odds.awayWin}%\n🤝 Beraberlik: ${odds.draw}%` 
          }
        )
        .setTimestamp();

      if (match.awayTeam.logo) {
        embed.setImage(match.awayTeam.logo);
      }

      console.log(`✅ Maç embed'i oluşturuldu: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      return embed;
    } catch (error) {
      console.error('❌ Maç embed\'i oluşturulurken hata oluştu:', error);
      return this.createErrorEmbed('Maç bilgisi oluşturulurken hata oluştu');
    }
  }

  private createErrorEmbed(message: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('⚠️ Hata')
      .setDescription(message)
      .setTimestamp();
  }

  private createGoogleButton(url?: string): ActionRowBuilder<ButtonBuilder> {
    const button = new ButtonBuilder()
      .setLabel('Maç Linki')
      .setStyle(ButtonStyle.Link)
      .setURL(url || 'https://google.com/search?q=ma%C3%A7');

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  }

  private async getRoleForMatch(match: Match): Promise<string> {
    const roles = await this.supabase.getRoles();
    
    // Check for home team role - exact match first
    const homeRole = roles.find(r => 
      r.name.toLowerCase() === match.homeTeam.name.toLowerCase()
    );
    if (homeRole) return `<@&${homeRole.id}>`;

    // Check for away team role - exact match first
    const awayRole = roles.find(r => 
      r.name.toLowerCase() === match.awayTeam.name.toLowerCase()
    );
    if (awayRole) return `<@&${awayRole.id}>`;

    // Check for partial matches (contains)
    const homePartialRole = roles.find(r => 
      r.name.toLowerCase().includes(match.homeTeam.name.toLowerCase()) ||
      match.homeTeam.name.toLowerCase().includes(r.name.toLowerCase())
    );
    if (homePartialRole) return `<@&${homePartialRole.id}>`;

    const awayPartialRole = roles.find(r => 
      r.name.toLowerCase().includes(match.awayTeam.name.toLowerCase()) ||
      match.awayTeam.name.toLowerCase().includes(r.name.toLowerCase())
    );
    if (awayPartialRole) return `<@&${awayPartialRole.id}>`;

    // Check if match has Turkish teams (GS, FB, BJK)
    const hasTurkishTeam = this.hasTurkishTeam(match);
    
    // If there's a Turkish team, use barbar role only for non-Turkish teams
    if (!hasTurkishTeam) {
      const barbarRole = await this.supabase.getBarbarRole();
      if (barbarRole) return `<@&${barbarRole.id}>`;
    }

    return '';
  }

  private hasTurkishTeam(match: Match): boolean {
    const turkishTeams = ['galatasaray', 'fenerbahçe', 'beşiktaş'];
    const homeTeamLower = match.homeTeam.name.toLowerCase();
    const awayTeamLower = match.awayTeam.name.toLowerCase();
    
    return turkishTeams.some(team => 
      homeTeamLower.includes(team) || awayTeamLower.includes(team)
    );
  }

  private async createVoiceRoomNotification(match: Match): Promise<EmbedBuilder> {
    // Check if teams exist before accessing their properties
    if (!match.homeTeam || !match.homeTeam.name) {
      console.error('❌ Ev takım bilgisi eksik veya geçersiz:', match.homeTeam);
      return this.createErrorEmbed('Ev takım bilgisi eksik');
    }
    
    if (!match.awayTeam || !match.awayTeam.name) {
      console.error('❌ Deplasman takım bilgisi eksik veya geçersiz:', match.awayTeam);
      return this.createErrorEmbed('Deplasman takım bilgisi eksik');
    }

    try {
      console.log(`🔔 Sesli oda bildirimi oluşturuluyor: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      const role = await this.getRoleForMatch(match);
      const matchTime = format(new Date(match.date), 'dd.MM.yyyy HH:mm');
      
      // Determine which team to highlight based on role
      let highlightedTeam = '';
      let roleDescription = '';
      
      if (role) {
        // Extract team name from role
        const roleName = role.replace(/<@&|>/g, '');
        const roles = await this.supabase.getRoles();
        const roleInfo = roles.find(r => r.id.toString() === roleName);
        
        if (roleInfo) {
          if (roleInfo.name.toLowerCase().includes('galatasaray')) {
            highlightedTeam = match.homeTeam.name.toLowerCase().includes('galatasaray') ? match.homeTeam.name : match.awayTeam.name;
            roleDescription = `${role} Galatasaraylılar! Maç başlıyor!`;
          } else if (roleInfo.name.toLowerCase().includes('fenerbahçe')) {
            highlightedTeam = match.homeTeam.name.toLowerCase().includes('fenerbahçe') ? match.homeTeam.name : match.awayTeam.name;
            roleDescription = `${role} Fenerbahçeliler! Maç başlıyor!`;
          } else if (roleInfo.name.toLowerCase().includes('beşiktaş')) {
            highlightedTeam = match.homeTeam.name.toLowerCase().includes('beşiktaş') ? match.homeTeam.name : match.awayTeam.name;
            roleDescription = `${role} Beşiktaşlılar! Maç başlıyor!`;
          } else if (roleInfo.name.toLowerCase().includes('barbar')) {
            highlightedTeam = 'Yabancı Takım';
            roleDescription = `${role} Barbarlar! Yabancı maç başlıyor!`;
          } else {
            roleDescription = `${role} Maç başlıyor!`;
          }
        } else {
          roleDescription = `${role} Maç başlıyor!`;
        }
      } else {
        roleDescription = '🚨 Maç başlıyor!';
      }
      
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🏟️ MAÇ ODASI HAZIR!')
        .setDescription(`**${match.homeTeam.name} vs ${match.awayTeam.name}**`)
        .addFields(
          { name: '📅 Maç Tarihi', value: matchTime, inline: true },
          { name: '🏟️ Lig', value: match.league || 'Bilinmiyor', inline: true },
          { name: '📺 Yayın', value: match.broadcastChannel || 'Bilinmiyor', inline: true },
          { name: '🔔 Bildirim', value: roleDescription, inline: false }
        )
        .setThumbnail(match.homeTeam.logo || '')
        .setImage(match.awayTeam.logo || '')
        .setFooter({ 
          text: highlightedTeam ? `${highlightedTeam} takımını destekleyin!` : 'Odaya katılarak maçı canlı takip edebilirsiniz!' 
        })
        .setTimestamp();

      console.log(`✅ Sesli oda bildirimi oluşturuldu: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      return embed;
    } catch (error) {
      console.error('❌ Sesli oda bildirimi oluşturulurken hata oluştu:', error);
      return this.createErrorEmbed('Sesli oda bildirimi oluşturulurken hata oluştu');
    }
  }

  async start() {
    this.login(config.discord.botToken);
  }
}
