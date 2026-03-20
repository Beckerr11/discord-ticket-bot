import "dotenv/config";
import fs from "fs";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { createTranscript } from "discord-html-transcripts";


const CONFIG_PATH = new URL("./logChannels.json", import.meta.url);
const PANEL_SELECT_ID = "ticket:type";
const CLOSE_BUTTON_ID = "ticket:close";

const TICKET_TYPES = {
  suporte: {
    label: "Support",
    description: "Questions, bugs, and onboarding help.",
    emoji: "🛠️",
    categoryKey: "categoria_suporte",
  },
  denuncias: {
    label: "Reports",
    description: "Private reports and moderation issues.",
    emoji: "🚨",
    categoryKey: "categoria_denuncias",
  },
  solicitarpremiacao: {
    label: "Billing",
    description: "Payment and reward related requests.",
    emoji: "💸",
    categoryKey: "categoria_solicitarpremiacao",
  },
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});


function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);

    const requiredKeys = [
      "cargoticket",
      "canallogsticket",
      "categoria_suporte",
      "categoria_denuncias",
      "categoria_solicitarpremiacao",
      "cor",
    ];

    for (const key of requiredKeys) {
      if (!parsed[key]) {
        throw new Error(`Missing config key: ${key}`);
      }
    }

    return parsed;
  } catch (error) {
    console.error("Unable to load logChannels.json:", error.message);
    process.exit(1);
  }
}


function sanitizeUsername(username) {
  return username.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 18) || "member";
}


function buildPanelEmbed(guild, config) {
  return new EmbedBuilder()
    .setColor(config.cor)
    .setAuthor({
      name: `${guild.name} | Ticket Center`,
      iconURL: guild.iconURL() ?? undefined,
    })
    .setTitle("Open a support ticket")
    .setDescription(
      "Choose the ticket type that matches the request. The bot creates a private channel for your conversation."
    );
}


function buildTicketEmbed(guild, config, ticketType, ownerId) {
  return new EmbedBuilder()
    .setColor(config.cor)
    .setAuthor({
      name: `${guild.name} | ${ticketType.label}`,
      iconURL: guild.iconURL() ?? undefined,
    })
    .setTitle(`${ticketType.emoji} ${ticketType.label} ticket`)
    .setDescription(
      `Welcome <@${ownerId}>. A member of the support team will join this channel soon.`
    );
}


function buildLogEmbed(config, guild, channel, ownerId, closedById) {
  return new EmbedBuilder()
    .setColor(config.cor)
    .setAuthor({
      name: `${guild.name} | Ticket Logs`,
      iconURL: guild.iconURL() ?? undefined,
    })
    .setTitle("Ticket closed")
    .addFields(
      { name: "Channel", value: channel.name, inline: true },
      { name: "Owner", value: `<@${ownerId}>`, inline: true },
      { name: "Closed by", value: `<@${closedById}>`, inline: true }
    )
    .setTimestamp();
}


function buildPanelComponents() {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(PANEL_SELECT_ID)
    .setPlaceholder("Select a ticket type")
    .addOptions(
      Object.entries(TICKET_TYPES).map(([value, ticketType]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(ticketType.label)
          .setDescription(ticketType.description)
          .setEmoji(ticketType.emoji)
          .setValue(value)
      )
    );

  return [new ActionRowBuilder().addComponents(selectMenu)];
}


function buildCloseComponents() {
  const closeButton = new ButtonBuilder()
    .setCustomId(CLOSE_BUTTON_ID)
    .setLabel("Close ticket")
    .setStyle(ButtonStyle.Danger);

  return [new ActionRowBuilder().addComponents(closeButton)];
}


async function registerCommands() {
  const command = new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Publish the ticket selector in a chosen channel.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Text channel that should receive the ticket panel.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  await client.application.commands.set([command]);
}


async function findOpenTicket(guild, ownerId) {
  const channels = await guild.channels.fetch();
  return channels.find(
    (channel) =>
      channel &&
      channel.type === ChannelType.GuildText &&
      channel.topic === `ticket-owner:${ownerId}`
  );
}


async function createTicketChannel(interaction, config, typeKey) {
  const ticketType = TICKET_TYPES[typeKey];
  if (!ticketType) {
    throw new Error("Invalid ticket type.");
  }

  const existingTicket = await findOpenTicket(interaction.guild, interaction.user.id);
  if (existingTicket) {
    return { existingTicket };
  }

  const categoryId = config[ticketType.categoryKey];
  const channelName = `ticket-${sanitizeUsername(interaction.user.username)}-${typeKey}`;

  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: `ticket-owner:${interaction.user.id}`,
    permissionOverwrites: [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: config.cargoticket,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ],
  });

  await channel.send({
    content: `<@${interaction.user.id}> <@&${config.cargoticket}>`,
    embeds: [buildTicketEmbed(interaction.guild, config, ticketType, interaction.user.id)],
    components: buildCloseComponents(),
  });

  return { channel };
}


async function handleTicketPanelCommand(interaction, config) {
  const targetChannel = interaction.options.getChannel("channel", true);

  await targetChannel.send({
    embeds: [buildPanelEmbed(interaction.guild, config)],
    components: buildPanelComponents(),
  });

  await interaction.reply({
    content: `Ticket panel published in ${targetChannel}.`,
    ephemeral: true,
  });
}


async function handleTicketSelection(interaction, config) {
  const typeKey = interaction.values[0];
  const result = await createTicketChannel(interaction, config, typeKey);

  if (result.existingTicket) {
    await interaction.reply({
      content: `You already have an open ticket: ${result.existingTicket}.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `Ticket created successfully: ${result.channel}.`,
    ephemeral: true,
  });
}


function getTicketOwnerId(channel) {
  return channel.topic?.replace("ticket-owner:", "") || null;
}


async function handleCloseTicket(interaction, config) {
  const channel = interaction.channel;
  const ownerId = getTicketOwnerId(channel);
  const canManageTicket =
    interaction.user.id === ownerId ||
    interaction.member.roles.cache.has(config.cargoticket);

  if (!canManageTicket) {
    await interaction.reply({
      content: "Only the ticket owner or the support team can close this channel.",
      ephemeral: true,
    });
    return;
  }

  const logChannel = await interaction.guild.channels.fetch(config.canallogsticket);
  const transcript = await createTranscript(channel, {
    limit: -1,
    filename: `${channel.name}.html`,
    saveImages: true,
  });

  if (logChannel?.isTextBased()) {
    await logChannel.send({
      embeds: [buildLogEmbed(config, interaction.guild, channel, ownerId, interaction.user.id)],
      files: [transcript],
    });
  }

  await interaction.reply({
    content: "Ticket closed. Transcript sent to the configured log channel.",
    ephemeral: true,
  });

  setTimeout(() => {
    channel.delete("Ticket closed via bot interaction").catch(() => {});
  }, 1500);
}


client.once(Events.ClientReady, async (readyClient) => {
  const config = loadConfig();
  await registerCommands();
  console.log(`Ticket bot ready as ${readyClient.user.tag}`);
  console.log(`Support role configured: ${config.cargoticket}`);
});


client.on(Events.InteractionCreate, async (interaction) => {
  const config = loadConfig();

  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "ticket-panel") {
      await handleTicketPanelCommand(interaction, config);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === PANEL_SELECT_ID) {
      await handleTicketSelection(interaction, config);
      return;
    }

    if (interaction.isButton() && interaction.customId === CLOSE_BUTTON_ID) {
      await handleCloseTicket(interaction, config);
    }
  } catch (error) {
    console.error("Ticket bot error:", error);

    if (interaction.isRepliable()) {
      const message = "The bot could not complete this action. Check the server configuration.";

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
      }
    }
  }
});


if (!process.env.DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN in the environment.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
