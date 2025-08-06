import { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, VoiceChannel, GuildScheduledEvent, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType } from 'discord.js';
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
    // Check for matches every 5 minutes
    setInterval(async () => {
      await this.checkForMatches();
      await this.checkForVoiceRooms();
    }, 5 * 60 * 1000);

    // Initial check
    this.checkForMatches();
    this.checkForVoiceRooms();
  }

  private async checkForMatches() {
    try {
      const matches = await this.supabase.getMatchesForNotification();
      
      for (const match of matches) {
        const channel = this.channels.cache.get(config.discord.fixtureChannelId) as any;
        if (!channel) continue;

        const role = await this.getRoleForMatch(match);
        const embed = await this.createMatchEmbed(match);
        
        await channel.send({
          content: role ? `${role} Maç Bildirimi!` : '🚨 Yeni Maç Bildirimi!',
          embeds: [embed],
          components: [this.createGoogleButton(match.googleLink)],
        });

        // Update only the notified status, not voice_room_created
        await this.supabase.updateMatchStatus(match.id, { notified: true });
      }
    } catch (error) {
      console.error('Error checking for matches:', error);
    }
  }

  private async checkForVoiceRooms() {
    try {
      const matches = await this.supabase.getMatchesForVoiceRoom();
      
      // Check if a voice room already exists for any of these matches
      const existingRoom = this.voiceChannels.values().next().value;
      if (existingRoom) {
        // Send notification in existing room
        const channel = this.channels.cache.get(existingRoom) as VoiceChannel;
        if (channel) {
          for (const match of matches) {
            const embed = await this.createVoiceRoomNotification(match);
            await channel.send({ embeds: [embed] });
          }
        }
        return;
      }

      // Create new voice room if none exists
      if (matches.length > 0) {
        const guild = this.guilds.cache.get(config.discord.guildId);
        if (!guild) return;

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

        // Send notifications with embed
        for (const match of matches) {
          const embed = await this.createVoiceRoomNotification(match);
          await channel.send({ embeds: [embed] });
        }

        // Create Discord scheduled event for the voice channel
        try {
          await this.createGuildEventWithRetry(matches[0], channel);
          console.log(`✅ Discord etkinliği oluşturuldu: ${matches[0].homeTeam.name} vs ${matches[0].awayTeam.name}`);
        } catch (error) {
          console.error('❌ Discord etkinliği oluşturulamadı:', error);
        }

        // Schedule room cleanup (3 hours after the first match time)
        const cleanupTime = new Date(matches[0].date);
        cleanupTime.setHours(cleanupTime.getHours() + 3);
        
        setTimeout(async () => {
          if (channel.deletable) {
            await channel.delete();
            this.voiceChannels.delete(channel.id);
          }
        }, cleanupTime.getTime() - Date.now());
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
      return this.createErrorEmbed('Ev takım bilgisi eksik');
    }
    
    if (!match.awayTeam || !match.awayTeam.name) {
      console.error('Away team data is missing or invalid:', match.awayTeam);
      return this.createErrorEmbed('Deplasman takım bilgisi eksik');
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

    // Check for barbar role for non-Turkish teams
    const isTurkishLeague = match.league.includes('Süper Lig') || match.league.includes('Türkiye');
    if (!isTurkishLeague) {
      const barbarRole = await this.supabase.getBarbarRole();
      if (barbarRole) return `<@&${barbarRole.id}>`;
    }

    return '';
  }

  private async createVoiceRoomNotification(match: Match): Promise<EmbedBuilder> {
    // Check if teams exist before accessing their properties
    if (!match.homeTeam || !match.homeTeam.name) {
      console.error('Home team data is missing or invalid:', match.homeTeam);
      return this.createErrorEmbed('Ev takım bilgisi eksik');
    }
    
    if (!match.awayTeam || !match.awayTeam.name) {
      console.error('Away team data is missing or invalid:', match.awayTeam);
      return this.createErrorEmbed('Deplasman takım bilgisi eksik');
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
      return this.createErrorEmbed('Sesli oda bildirimi oluşturulurken hata oluştu');
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
    
    const event = await guild.scheduledEvents.create({
      name: `${match.homeTeam.name} - ${match.awayTeam.name}`,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.Voice,
      entityMetadata: { location: channel.id },
      scheduledStartTime: new Date(match.date),
      description: await this.createEventDescription(match),
    });

    // Veritabanına event_id'yi kaydet
    await this.supabase.updateMatchWithEventId(match.id, event.id);
    
    // events tablosuna kaydet
    await this.supabase.createEvent(match.id, event.id);
    
    return event;
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
