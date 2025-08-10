import { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, VoiceChannel } from 'discord.js';
import { config } from './utils/config';
import { SupabaseService } from './services/supabase';
import { OpenRouterService } from './services/openrouter';
import { FixtureSyncService } from './syncFixtures';
import { Match } from './types';
import { format } from 'date-fns';
import { INTERVALS, COLORS, TURKISH_TEAMS, ERROR_MESSAGES } from './utils/constants';

export class DiscordClient extends Client {
  public commands: Collection<string, any> = new Collection();
  public supabase: SupabaseService;
  public openrouter: OpenRouterService;
  public fixtureSyncService: FixtureSyncService;
  private voiceChannels: Set<string> = new Set();
  private syncInterval?: NodeJS.Timeout;

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
    this.fixtureSyncService = new FixtureSyncService();
    this.setupCommands();
    this.setupEventHandlers();
  }

  private setupCommands() {
    const commands = [
      new SlashCommandBuilder()
        .setName('hafta')
        .setDescription('Gelecek 7 günün maç fikstürünü gösterir')
        .toJSON(),
    ];

    const rest = new REST({ version: '10' }).setToken(config.discord.botToken);

    (async () => {
      try {
        console.log('Started refreshing application (/) commands.');
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
    this.on('ready', async () => {
      console.log(`Logged in as ${this.user?.tag}!`);
      await this.setDynamicStatus();
      this.scheduleTasks();
      this.startAutoSync();
    });

    this.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = interaction.commandName;
      
      if (command === 'hafta') {
        await this.handleWeekCommand(interaction);
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
    }, INTERVALS.MATCH_CHECK);

    // 🧹 Voice room cleanup every 5 minutes (EKLENDİ!)
    setInterval(async () => {
      await this.cleanupExpiredVoiceRooms();
    }, 5 * 60 * 1000); // 5 dakika

    // Initial check
    (async () => {
      await Promise.all([
        this.checkForMatches(),
        this.checkForVoiceRooms(),
        this.cleanupExpiredVoiceRooms() // İlk başta da cleanup
      ]);
    })();
  }

  private async checkForMatches() {
    try {
      console.log('🔍 Checking for matches...');
      const matches = await this.supabase.getMatchesForNotification();
      console.log(`📊 Found ${matches.length} matches for notification`);
      
      if (matches.length === 0) return;
      
      console.log(`🔍 Looking for channel: ${config.discord.fixtureChannelId}`);
      const channel = this.channels.cache.get(config.discord.fixtureChannelId) as any;
      if (!channel) {
        console.error(`❌ Channel not found: ${config.discord.fixtureChannelId}`);
        console.error(`Available channels: ${this.channels.cache.size} total channels`);
        return;
      }
      console.log(`✅ Channel found: ${channel.name}`);

      // Paralel işlem için Promise.all kullan
      await Promise.all(matches.map(async (match) => {
        try {
          console.log(`📤 Processing notification for match: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
          console.log(`   📅 Match date: ${match.date}`);
          console.log(`   🏟️ League: ${match.league}`);
          
          const role = await this.getRoleForMatch(match);
          console.log(`   👥 Role found: ${role ? 'Yes' : 'No'} - ${role || 'No role'}`);
          
          const embed = await this.createMatchEmbed(match);
          console.log(`   📋 Embed created successfully`);
          
          const sentMessage = await channel.send({
            content: role ? `${role} Maç Bildirimi!` : '🚨 Yeni Maç Bildirimi!',
            embeds: [embed],
            components: [this.createGoogleButton(match.googleLink)],
          });
          console.log(`   ✅ Notification sent successfully - Message ID: ${sentMessage.id}`);

          // Update only the notified status, not voice_room_created
          await this.supabase.updateMatchStatus(match.id, { notified: true });
          console.log(`   📝 Database updated - notified: true for match ${match.id}`);
          
        } catch (error) {
          console.error(`❌ Error processing match ${match.id} (${match.homeTeam.name} vs ${match.awayTeam.name}):`, error);
        }
      }));
    } catch (error) {
      console.error('Error checking for matches:', error);
    }
  }

  private async checkForVoiceRooms() {
    try {
      console.log('🎤 Checking for voice room creation...');
      const matches = await this.supabase.getMatchesForVoiceRoom();
      console.log(`📊 Found ${matches.length} matches needing voice rooms`);
      
      if (matches.length === 0) return;

      // Log match details
      matches.forEach(match => {
        console.log(`   🏟️ ${match.homeTeam.name} vs ${match.awayTeam.name} - ${match.date}`);
      });
      
      // Check if a voice room already exists for any of these matches
      const existingRoom = this.voiceChannels.values().next().value;
      if (existingRoom) {
        console.log(`🎤 Existing voice room found: ${existingRoom}`);
        // Send notification in existing room
        const channel = this.channels.cache.get(existingRoom) as VoiceChannel;
        if (channel) {
          console.log(`   📤 Sending notification to existing room: ${channel.name}`);
          // Sadece bir bildirim gönder
          const firstMatch = matches[0];
          const embed = await this.createVoiceRoomNotification(firstMatch);
          await channel.send({ embeds: [embed] });
          console.log(`   ✅ Notification sent to existing room`);
        }
        return;
      }

      console.log('🏗️ Creating new voice room...');
      // Create new voice room if none exists
      const guild = this.guilds.cache.get(config.discord.guildId);
      if (!guild) {
        console.error(`❌ Guild not found: ${config.discord.guildId}`);
        console.error(ERROR_MESSAGES.GUILD_NOT_FOUND);
        return;
      }
      console.log(`✅ Guild found: ${guild.name}`);

      // Create informative channel name with team abbreviations
      const firstMatch = matches[0];
      const homeTeamAbbr = firstMatch.homeTeam.short_name || firstMatch.homeTeam.name.substring(0, 3).toUpperCase();
      const awayTeamAbbr = firstMatch.awayTeam.short_name || firstMatch.awayTeam.name.substring(0, 3).toUpperCase();
      const leagueName = firstMatch.league.replace(/[^a-zA-Z0-9şğüıöçŞĞÜİÖÇ\s]/g, '').substring(0, 15);
      
      const channelName = `🏟️ ${homeTeamAbbr} vs ${awayTeamAbbr} | ${leagueName}`;
      console.log(`🏷️ Creating channel with name: "${channelName}"`);
      
      // Get the highest position among voice channels to place new channel at the top
      const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice);
      const highestPosition = voiceChannels.size > 0 ? 
        Math.max(...voiceChannels.map(c => c.position)) + 1 : 0;
      console.log(`📍 Placing channel at position: ${highestPosition}`);

      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        reason: 'Match starting soon',
        position: highestPosition, // Place at the top
      });
      console.log(`✅ Voice channel created successfully: ${channel.name} (ID: ${channel.id})`);

      this.voiceChannels.add(channel.id);
      console.log(`📝 Added channel to tracking list. Total tracked: ${this.voiceChannels.size}`);

      // Sadece bir bildirim gönder
      console.log(`📤 Sending voice room notification...`);
      const embed = await this.createVoiceRoomNotification(firstMatch);
      const sentMessage = await channel.send({ embeds: [embed] });
      console.log(`✅ Voice room notification sent - Message ID: ${sentMessage.id}`);

      // Tüm maçlar için voice_room_created durumunu güncelle
      console.log(`📝 Updating database for ${matches.length} matches...`);
      await Promise.all(matches.map(async (match) => {
        try {
          await this.supabase.updateMatchStatus(match.id, { voice_room_created: true });
          console.log(`   ✅ Updated match ${match.id}: voice_room_created = true`);
        } catch (error) {
          console.error(`   ❌ Failed to update match ${match.id}:`, error);
        }
      }));

      // Schedule room cleanup (2 hours after the first match time)
      console.log(`⏰ Scheduling room cleanup...`);
      const cleanupTime = new Date(firstMatch.date);
      cleanupTime.setHours(cleanupTime.getHours() + 2);
      
      const cleanupTimeout = cleanupTime.getTime() - Date.now();
      console.log(`   📅 Match time: ${firstMatch.date}`);
      console.log(`   ⏰ Cleanup scheduled for: ${cleanupTime.toISOString()}`);
      console.log(`   ⌛ Cleanup timeout: ${cleanupTimeout}ms (${Math.round(cleanupTimeout / 1000 / 60)} minutes)`);
      
      if (cleanupTimeout > 0) {
        console.log(`⏰ Room will be deleted in ${Math.round(cleanupTimeout / 1000 / 60)} minutes`);
        setTimeout(async () => {
          try {
            console.log(`🧹 Starting room cleanup for: ${channel.name}`);
            if (channel.deletable) {
              await channel.delete();
              this.voiceChannels.delete(channel.id);
              console.log(`✅ Voice room cleaned up successfully: ${channel.name} (ID: ${channel.id})`);
              console.log(`📝 Removed from tracking list. Remaining: ${this.voiceChannels.size}`);
            } else {
              console.log(`⚠️ Channel not deletable: ${channel.name}`);
            }
          } catch (error) {
            console.error(`❌ Error cleaning up voice room ${channel.name}:`, error);
          }
        }, cleanupTimeout);
      } else {
        console.log('⚠️ Cleanup time already passed, deleting room immediately');
        try {
          console.log(`🧹 Attempting immediate deletion of: ${channel.name}`);
          if (channel.deletable) {
            await channel.delete();
            this.voiceChannels.delete(channel.id);
            console.log(`✅ Voice room immediately deleted: ${channel.name}`);
          } else {
            console.log(`⚠️ Channel not deletable: ${channel.name}`);
          }
        } catch (error) {
          console.error(`❌ Error during immediate deletion: ${error}`);
        }
      }
    } catch (error) {
      console.error('❌ Error in checkForVoiceRooms:', error);
    }
  }

  private async handleWeekCommand(interaction: any) {
    try {
      await interaction.deferReply();

      const matches = await this.supabase.getUpcomingMatches(7);
      if (matches.length === 0) {
        await interaction.editReply('Bu hafta için maç bulunamadı.');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📅 Haftalık Maç Fikstürü')
        .setColor(COLORS.PRIMARY)
        .setDescription('Gelecek 7 gündeki maçlar')
        .setTimestamp();

      let description = '';
      for (const match of matches) {
        const date = format(new Date(match.date), 'dd.MM.yyyy HH:mm');
        description += `**${match.homeTeam.name} vs ${match.awayTeam.name}**\n`;
        description += `📅 ${date} - 🏟️ ${match.league}\n\n`;
      }

      embed.setDescription(description);
      embed.setFooter({ text: '⚽ Barbar Botu • Türk takımlarını destekliyoruz!', iconURL: this.user?.displayAvatarURL() });
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error handling week command:', error);
      await interaction.editReply('Haç listesi alınırken bir hata oluştu.');
    }
  }

  private async createMatchEmbed(match: Match): Promise<EmbedBuilder> {
    // Check if teams exist before accessing their properties
    if (!match.homeTeam || !match.homeTeam.name) {
      console.error('Home team data is missing or invalid:', match.homeTeam);
      return this.createErrorEmbed(ERROR_MESSAGES.MISSING_HOME_TEAM);
    }
    
    if (!match.awayTeam || !match.awayTeam.name) {
      console.error('Away team data is missing or invalid:', match.awayTeam);
      return this.createErrorEmbed(ERROR_MESSAGES.MISSING_AWAY_TEAM);
    }

    try {
      const odds = await this.openrouter.getMatchOdds(match.homeTeam.name, match.awayTeam.name);
      
      const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
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

      return embed;
    } catch (error) {
      console.error('Error creating match embed:', error);
      return this.createErrorEmbed(ERROR_MESSAGES.MATCH_EMBED_ERROR);
    }
  }

  private createErrorEmbed(message: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(COLORS.ERROR)
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
    
    // Check for home team role
    const homeRole = roles.find(r => 
      r.teamId && match.homeTeam.name.toLowerCase().includes(r.name.toLowerCase())
    );
    if (homeRole) return `<@&${homeRole.id}>`;

    // Check for away team role
    const awayRole = roles.find(r => 
      r.teamId && match.awayTeam.name.toLowerCase().includes(r.name.toLowerCase())
    );
    if (awayRole) return `<@&${awayRole.id}>`;

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
    const homeTeamLower = match.homeTeam.name.toLowerCase();
    const awayTeamLower = match.awayTeam.name.toLowerCase();
    
    return TURKISH_TEAMS.some(team => 
      homeTeamLower.includes(team) || awayTeamLower.includes(team)
    );
  }

  private async createVoiceRoomNotification(match: Match): Promise<EmbedBuilder> {
    // Check if teams exist before accessing their properties
    if (!match.homeTeam || !match.homeTeam.name) {
      console.error('Home team data is missing or invalid:', match.homeTeam);
      return this.createErrorEmbed(ERROR_MESSAGES.MISSING_HOME_TEAM);
    }
    
    if (!match.awayTeam || !match.awayTeam.name) {
      console.error('Away team data is missing or invalid:', match.awayTeam);
      return this.createErrorEmbed(ERROR_MESSAGES.MISSING_AWAY_TEAM);
    }

    try {
      const role = await this.getRoleForMatch(match);
      const matchTime = format(new Date(match.date), 'dd.MM.yyyy HH:mm');
      
      // Determine which team to highlight based on role
      let highlightedTeam = '';
      let roleDescription = '';
      
      if (role) {
        // Extract team name from role
        const roleName = role.replace(/<@&|>/g, '');
        const roles = await this.supabase.getRoles();
        const roleInfo = roles.find(r => r.id === roleName);
        
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
        .setColor(COLORS.SUCCESS)
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

      return embed;
    } catch (error) {
      console.error('Error creating voice room notification:', error);
      return this.createErrorEmbed(ERROR_MESSAGES.VOICE_ROOM_ERROR);
    }
  }

  private async setDynamicStatus() {
    try {
      const statusMessages = [
        '⚽ Maçları takip ediyor',
        '📅 Günlük fikstürleri kontrol ediyor',
        '🏆 Fikstürleri senkronize ediyor',
        '🔔 Maç bildirimlerini hazırlıyor',
        '⭐ Türk takımlarını destekliyor',
        '📊 Maç istatistiklerini analiz ediyor'
      ];

      // Rastgele status seç
      const randomStatus = statusMessages[Math.floor(Math.random() * statusMessages.length)];
      
      this.user?.setPresence({
        activities: [{
          name: randomStatus,
          type: 3 // WATCHING
        }],
        status: 'online'
      });

      console.log(`🎯 Bot status set: ${randomStatus}`);
      
      // Her 10 dakikada status güncelle
      setInterval(async () => {
        const newRandomStatus = statusMessages[Math.floor(Math.random() * statusMessages.length)];
        this.user?.setPresence({
          activities: [{
            name: newRandomStatus,
            type: 3
          }],
          status: 'online'
        });
      }, 10 * 60 * 1000);

    } catch (error) {
      console.error('Error setting dynamic status:', error);
    }
  }

  private async startAutoSync() {
    console.log('🔄 Starting automatic fixture sync service...');
    
    // Initial sync
    await this.performAutoSync();
    
    // Schedule sync every 7 days (604,800,000 ms)
    this.syncInterval = setInterval(async () => {
      await this.performAutoSync();
    }, 7 * 24 * 60 * 60 * 1000);
    
    console.log('✅ Auto-sync scheduled every 7 days');
  }

  private async performAutoSync() {
    try {
      console.log('🔄 Starting automatic fixture synchronization...');
      const startTime = Date.now();
      
      // 🧹 Önce ertelenen maçları temizle
      console.log('🧹 Cleaning postponed matches before sync...');
      const cleanedCount = await this.supabase.cleanPostponedMatches();
      console.log(`✅ Cleaned ${cleanedCount} postponed matches`);
      
      await this.fixtureSyncService.syncAllFixtures();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Automatic sync completed in ${duration}s`);
      
      // Send notification to general channel if available
      await this.sendSyncNotification(true, duration, undefined, cleanedCount);
      
    } catch (error) {
      console.error('❌ Automatic sync failed:', error);
      await this.sendSyncNotification(false, '0', error);
    }
  }

  private async sendSyncNotification(success: boolean, duration: string, error?: any, cleanedCount?: number) {
    try {
      const guilds = this.guilds.cache;
      
      for (const guild of guilds.values()) {
        // Try to find a general or notification channel
        const channel = guild.channels.cache.find(ch => 
          ch.name.includes('fikstur')
        );

        if (channel && channel.isTextBased()) {
          const cleanupText = cleanedCount ? `\n🧹 ${cleanedCount} ertelenen maç temizlendi` : '';
          
          const embed = new EmbedBuilder()
            .setColor(success ? COLORS.SUCCESS : COLORS.ERROR)
            .setTitle(success ? '✅ Otomatik Fikstür Güncellemesi' : '❌ Fikstür Güncelleme Hatası')
            .setDescription(success 
              ? `Tüm takım fikstürleri başarıyla güncellendi.\n⏱️ Süre: ${duration} saniye${cleanupText}`
              : `Fikstür güncellemesi sırasında hata oluştu.\n\`\`\`${error?.message || 'Bilinmeyen hata'}\`\`\``
            )
            .setTimestamp();

          await channel.send({ embeds: [embed] });
          break; // Only send to first found channel per guild
        }
      }
    } catch (notificationError) {
      console.error('Failed to send sync notification:', notificationError);
    }
  }

  // 🧹 VOICE ROOM CLEANUP METODU  
  private async cleanupExpiredVoiceRooms() {
    try {
      console.log('🧹 Starting voice room cleanup...');
      
      // Her guild'de voice channel'ları kontrol et
      for (const guild of this.guilds.cache.values()) {
        const voiceChannels = guild.channels.cache.filter(channel => 
          channel.type === 2 && // Voice channel
          channel.name.includes('vs') && // Match pattern
          channel.name.includes('🏟️') // Our match channels
        );

        console.log(`🔍 Found ${voiceChannels.size} potential match voice channels in ${guild.name}`);

        for (const channel of voiceChannels.values()) {
          try {
            // Channel creation time'ını kontrol et (2 saatten eski mi?)
            if (channel.createdTimestamp) {
              const channelAge = Date.now() - channel.createdTimestamp;
              const twoHoursInMs = 2 * 60 * 60 * 1000;

              if (channelAge > twoHoursInMs && 'deletable' in channel && channel.deletable) {
                console.log(`🗑️ Deleting expired voice room (${Math.floor(channelAge / 60000)}min old): ${channel.name}`);
                await channel.delete();
                console.log(`✅ Successfully deleted: ${channel.name}`);
                
                // Voice channel map'ten de kaldır
                this.voiceChannels.delete(channel.id);
              } else if (channelAge > twoHoursInMs) {
                console.log(`⚠️ Channel too old but not deletable: ${channel.name}`);
              }
            }
          } catch (deleteError) {
            console.error(`❌ Error deleting voice room ${channel.name}:`, deleteError);
          }
        }
      }

      console.log('✅ Voice room cleanup completed');
    } catch (error) {
      console.error('❌ Error in cleanupExpiredVoiceRooms:', error);
    }
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      console.log('🛑 Auto-sync stopped');
    }
    this.destroy();
  }

  async start() {
    this.login(config.discord.botToken);
  }
}
