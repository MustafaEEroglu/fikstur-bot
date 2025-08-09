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
      const matches = await this.supabase.getMatchesForNotification();
      
      if (matches.length === 0) return;
      
      const channel = this.channels.cache.get(config.discord.fixtureChannelId) as any;
      if (!channel) {
        console.error(ERROR_MESSAGES.CHANNEL_NOT_FOUND);
        return;
      }

      // Paralel işlem için Promise.all kullan
      await Promise.all(matches.map(async (match) => {
        try {
          const role = await this.getRoleForMatch(match);
          const embed = await this.createMatchEmbed(match);
          
          await channel.send({
            content: role ? `${role} Maç Bildirimi!` : '🚨 Yeni Maç Bildirimi!',
            embeds: [embed],
            components: [this.createGoogleButton(match.googleLink)],
          });

          // Update only the notified status, not voice_room_created
          await this.supabase.updateMatchStatus(match.id, { notified: true });
        } catch (error) {
          console.error(`Error processing match ${match.id}:`, error);
        }
      }));
    } catch (error) {
      console.error('Error checking for matches:', error);
    }
  }

  private async checkForVoiceRooms() {
    try {
      const matches = await this.supabase.getMatchesForVoiceRoom();
      
      if (matches.length === 0) return;
      
      // Check if a voice room already exists for any of these matches
      const existingRoom = this.voiceChannels.values().next().value;
      if (existingRoom) {
        // Send notification in existing room
        const channel = this.channels.cache.get(existingRoom) as VoiceChannel;
        if (channel) {
          // Sadece bir bildirim gönder
          const firstMatch = matches[0];
          const embed = await this.createVoiceRoomNotification(firstMatch);
          await channel.send({ embeds: [embed] });
        }
        return;
      }

      // Create new voice room if none exists
      const guild = this.guilds.cache.get(config.discord.guildId);
      if (!guild) {
        console.error(ERROR_MESSAGES.GUILD_NOT_FOUND);
        return;
      }

      // Create informative channel name with team abbreviations
      const firstMatch = matches[0];
      const homeTeamAbbr = firstMatch.homeTeam.short_name || firstMatch.homeTeam.name.substring(0, 3).toUpperCase();
      const awayTeamAbbr = firstMatch.awayTeam.short_name || firstMatch.awayTeam.name.substring(0, 3).toUpperCase();
      const leagueName = firstMatch.league.replace(/[^a-zA-Z0-9şğüıöçŞĞÜİÖÇ\s]/g, '').substring(0, 15);
      
      const channelName = `🏟️ ${homeTeamAbbr} vs ${awayTeamAbbr} | ${leagueName}`;
      
      // Get the highest position among voice channels to place new channel at the top
      const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice);
      const highestPosition = voiceChannels.size > 0 ? 
        Math.max(...voiceChannels.map(c => c.position)) + 1 : 0;

      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        reason: 'Match starting soon',
        position: highestPosition, // Place at the top
      });

      this.voiceChannels.add(channel.id);

      // Sadece bir bildirim gönder
      const embed = await this.createVoiceRoomNotification(firstMatch);
      await channel.send({ embeds: [embed] });

      // Tüm maçlar için voice_room_created durumunu güncelle
      await Promise.all(matches.map(async (match) => {
        try {
          await this.supabase.updateMatchStatus(match.id, { voice_room_created: true });
        } catch (error) {
          console.error(`Error updating voice_room_created for match ${match.id}:`, error);
        }
      }));

      // Schedule room cleanup (2 hours after the first match time)
      const cleanupTime = new Date(firstMatch.date);
      cleanupTime.setHours(cleanupTime.getHours() + 2);
      
      const cleanupTimeout = cleanupTime.getTime() - Date.now();
      if (cleanupTimeout > 0) {
        setTimeout(async () => {
          try {
            if (channel.deletable) {
              await channel.delete();
              this.voiceChannels.delete(channel.id);
              console.log(`🧹 Sesli oda temizlendi: ${channel.name}`);
            }
          } catch (error) {
            console.error(`Sesli oda temizlenirken hata oluştu: ${error}`);
          }
        }, cleanupTimeout);
      } else {
        console.log('⚠️ Temizleme zamanı geçmiş, oda hemen siliniyor');
        try {
          if (channel.deletable) {
            await channel.delete();
            this.voiceChannels.delete(channel.id);
          }
        } catch (error) {
          console.error(`Hemen silme sırasında hata oluştu: ${error}`);
        }
      }
    } catch (error) {
      console.error('Error checking for voice rooms:', error);
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
      
      await this.fixtureSyncService.syncAllFixtures();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Automatic sync completed in ${duration}s`);
      
      // Send notification to general channel if available
      await this.sendSyncNotification(true, duration);
      
    } catch (error) {
      console.error('❌ Automatic sync failed:', error);
      await this.sendSyncNotification(false, '0', error);
    }
  }

  private async sendSyncNotification(success: boolean, duration: string, error?: any) {
    try {
      const guilds = this.guilds.cache;
      
      for (const guild of guilds.values()) {
        // Try to find a general or notification channel
        const channel = guild.channels.cache.find(ch => 
          ch.name.includes('fikstur')
        );

        if (channel && channel.isTextBased()) {
          const embed = new EmbedBuilder()
            .setColor(success ? COLORS.SUCCESS : COLORS.ERROR)
            .setTitle(success ? '✅ Otomatik Fikstür Güncellemesi' : '❌ Fikstür Güncelleme Hatası')
            .setDescription(success 
              ? `Tüm takım fikstürleri başarıyla güncellendi.\n⏱️ Süre: ${duration} saniye`
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
