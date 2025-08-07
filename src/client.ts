import { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, VoiceChannel, GuildScheduledEvent, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType } from 'discord.js';
import { config } from './utils/config';
import { SupabaseService } from './services/supabase';
import { OpenRouterService } from './services/openrouter';
import { Match } from './types';
import { format } from 'date-fns';
import { testCommands, handleTestCommand } from './testCommands';
import { INTERVALS, TURKISH_TEAMS, ERROR_MESSAGES } from './utils/constants';

// Yardımcı fonksiyonlar
function getEntityTypeString(entityType: GuildScheduledEventEntityType): string {
  switch (entityType) {
    case GuildScheduledEventEntityType.StageInstance:
      return 'Stage Instance';
    case GuildScheduledEventEntityType.Voice:
      return 'Voice';
    case GuildScheduledEventEntityType.External:
      return 'External';
    default:
      return 'Unknown';
  }
}

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

      // Create Discord scheduled event for the voice channel
      try {
        const event = await this.createGuildEventWithRetry(firstMatch, channel);
        if (event) {
          console.log(`✅ Discord etkinliği oluşturuldu: ${firstMatch.homeTeam.name} vs ${firstMatch.awayTeam.name}`);
        }
      } catch (error) {
        console.error('❌ Discord etkinliği oluşturulamadı:', error);
      }

      // Tüm maçlar için voice_room_created durumunu güncelle
      await Promise.all(matches.map(async (match) => {
        try {
          await this.supabase.updateMatchStatus(match.id, { voice_room_created: true });
        } catch (error) {
          console.error(`Error updating voice_room_created for match ${match.id}:`, error);
        }
      }));

      // Schedule room cleanup (3 hours after the first match time)
      const cleanupTime = new Date(firstMatch.date);
      cleanupTime.setHours(cleanupTime.getHours() + 3);
      
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

      return embed;
    } catch (error) {
      console.error('Error creating match embed:', error);
      return this.createErrorEmbed(ERROR_MESSAGES.MATCH_EMBED_ERROR);
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

      return embed;
    } catch (error) {
      console.error('Error creating voice room notification:', error);
      return this.createErrorEmbed(ERROR_MESSAGES.VOICE_ROOM_ERROR);
    }
  }

  private async createEventDescription(match: Match): Promise<string> {
    const matchTime = format(new Date(match.date), 'dd.MM.yyyy HH:mm');
    
    try {
      const odds = await this.openrouter.getMatchOdds(match.homeTeam.name, match.awayTeam.name);
      const role = await this.getRoleForMatch(match);
      
      return `🏟️ **${match.league}**

⚽ **Maç**: ${match.homeTeam.name} vs ${match.awayTeam.name}
📅 **Tarih**: ${matchTime}
📺 **Yayın**: ${match.broadcastChannel || 'Bilinmiyor'}
🎲 **Kazanma Oranları**:
   🔴 ${match.homeTeam.name}: ${odds.homeWin}%
   🔵 ${match.awayTeam.name}: ${odds.awayWin}%
   🤝 Beraberlik: ${odds.draw}%

🔔 **Bildirim**: ${role || '🚨'} Maç başlıyor!

Odaya katılarak maçı canlı takip edebilirsiniz!`;
    } catch (error) {
      console.error('Error creating event description:', error);
      return `🏟️ **${match.league}**

⚽ **Maç**: ${match.homeTeam.name} vs ${match.awayTeam.name}
📅 **Tarih**: ${matchTime}
📺 **Yayın**: ${match.broadcastChannel || 'Bilinmiyor'}

🔔 **Bildirim**: Maç başlıyor!

Odaya katılarak maçı canlı takip edebilirsiniz!`;
    }
  }

  private async createGuildEvent(match: Match, channel: VoiceChannel): Promise<GuildScheduledEvent> {
    const guild = channel.guild;
    
    console.log(`🎭 Event oluşturma detayları:`);
    console.log(`   - Maç: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
    console.log(`   - Event adı: ${match.homeTeam.name} - ${match.awayTeam.name}`);
    console.log(`   - Event tipi: Voice`);
    console.log(`   - Lokasyon (kanal ID): ${channel.id}`);
    console.log(`   - Başlangıç zamanı: ${match.date}`);
    console.log(`   - Gizlilik: GuildOnly`);
    
    try {
      console.log(`🚀 Discord API'ye event oluşturma isteği gönderiliyor...`);
      const event = await guild.scheduledEvents.create({
        name: `${match.homeTeam.name} - ${match.awayTeam.name}`,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.Voice,
        entityMetadata: { location: channel.id },
        scheduledStartTime: new Date(match.date),
        description: await this.createEventDescription(match),
      });
      
      console.log(`✅ Discord event başarıyla oluşturuldu!`);
      console.log(`   - Event ID: ${event.id}`);
      console.log(`   - Event adı: ${event.name}`);
      console.log(`   - Event URL: ${event.url || 'Mevcut değil'}`);
      console.log(`   - Entity ID: ${event.entityId}`);
      console.log(`   - Entity Type: ${getEntityTypeString(event.entityType)}`);
      
      // Veritabanına event_id'yi kaydet
      console.log(`💾 Veritabanına event bilgileri kaydediliyor...`);
      await this.supabase.updateMatchWithEventId(match.id, event.id);
      console.log(`   - Maç tablosu güncellendi: event_id = ${event.id}`);
      
      // events tablosuna kaydet
      const dbEvent = await this.supabase.createEvent(match.id, event.id);
      console.log(`   - Events tablosuna kayıt eklendi: ID = ${dbEvent.id}`);
      
      return event;
    } catch (error) {
      console.error(`❌ Event oluşturma sırasında hata oluştu:`, error);
      console.error(`   - Hata detayları: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
      throw error;
    }
  }

  private async createGuildEventWithRetry(match: Match, channel: VoiceChannel, maxRetries = 3): Promise<GuildScheduledEvent | null> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.createGuildEvent(match, channel);
      } catch (error) {
        console.error(`Etkinlik oluşturulamadı (deneme ${i + 1}/${maxRetries}):`, error);
        if (i === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
      }
    }
    return null;
  }


  async start() {
    this.login(config.discord.botToken);
  }
}
