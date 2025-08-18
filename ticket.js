import { Command, Responder, ResponderType } from "#base";
import { db } from "#database";
import axios from "axios";
import { createTranscript } from "discord-html-transcripts";
import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from "discord.js";
import FormData from "form-data";
import fs from "fs";

async function loadLogChannels() {
  let logChannels;
  try {
    logChannels = JSON.parse(fs.readFileSync("./logChannels.json", "utf-8"));
  } catch (error) {
    console.error("Erro ao ler logChannels.json:", error);
    return null;
  }

  if (!logChannels) {
    console.error("logChannels não foi carregado corretamente.");
    return null;
  }

  return logChannels;
}

  new Command({
      name: "ticket",
      description: "Abra o painel de tickets para os membros.",
      type: ApplicationCommandType.ChatInput,
      defaultMemberPermissions: "Administrator",
      options: [
          {
              name: "canal_ticket",
              description: "Canal para enviar o sistema de tickets para os membros.",
              type: ApplicationCommandOptionType.Channel,
              channelTypes: [ChannelType.GuildText],
              required: true,
          },
      ],
      async run(interaction) {

          let logChannels;
          try {
              logChannels = JSON.parse(fs.readFileSync('./logChannels.json', 'utf-8'));
          }
          catch (error) {
              console.error('Erro ao ler logChannels.json:', error);
              return;
          }

          const hexColor = logChannels.cor || '0x2b2d31';

          const { options } = interaction;
          const canal_formulario = options.getChannel("canal_ticket", true);
          if (!canal_formulario.isTextBased())
              return;
          await db.tickets.findOneAndUpdate({ guildId: interaction.guild.id }, { canalFormularioId: canal_formulario.id }, { upsert: true });
          const embed = new EmbedBuilder()
              .setTitle("Canais Configurados!")
              .setDescription(`> Canal de Ticket: ${canal_formulario}.`);
          interaction.reply({ embeds: [embed], ephemeral: true }).then(() => {
              const embed_formulario = new EmbedBuilder()
                  .setColor(hexColor)
                  .setThumbnail(interaction.guild.iconURL())
                  .setAuthor({
                  name: `${interaction.guild.name}`,
                  iconURL: interaction.guild.iconURL() ?? undefined,
              })
                 .setDescription("⚠️ Nossa equipe está sempre disponível e comprometida em responder com a máxima agilidade todos os chamados que recebemos, garantindo assim um atendimento eficiente e eficaz.\n\n> Para abrir um **canal de atendimento**, selecione uma categoria abaixo.");
              const selectMenu = new StringSelectMenuBuilder()
                  .setCustomId("ticket_select")
                  .setPlaceholder("➡️ Clique aqui para selecionar...")
                  .addOptions({
                  label: "Suporte",
                  value: "suporte",
                  emoji: "🙋",
                  description: "Está com dúvidas referente à algo?",
              }, {
                  label: "Denúncias",
                  value: "denuncias",
                  emoji: "🚨",
                  description: "Faça uma denúncia aqui de algum usuário.",
              }, {
                  label: "Solicitar Pagamento",
                  value: "solicitarpremiacao",
                  emoji: "💸",
                  description: "Precisa solicitar um pagamento?",
              });
              const actionRow = new ActionRowBuilder().addComponents(selectMenu);
              canal_formulario.send({
                  embeds: [embed_formulario],
                  components: [actionRow],
              });
          });
      },
  });
new Responder({
  customId: "ticket_select",
  type: ResponderType.StringSelect,
  cache: "cached",
  async run(interaction) {
    const logChannels = await loadLogChannels();
    if (!logChannels) {
      await interaction.reply({
        content:
          "Erro ao carregar as configurações de log. Tente novamente mais tarde.",
        ephemeral: true,
      });
      return;
    }

    const cargoPermissaoId = logChannels.cargoticket;
    const canal_logs_id = logChannels.canallogsticket;
    const canal_gerais_id = logChannels.canalgeralticket;

    const hexColor = logChannels.cor || "0x2b2d31";

    const user = interaction.user;
    const guild = interaction.guild;
    const ticketType = interaction.values[0];
    const ticketTypes = {
      suporte: { emoji: "🙋", color: "#3498DB", description: "🙋 Suporte", label: "Suporte" },
      denuncias: { emoji: "🚨", color: "#2ECC71", description: "🚨 Denúncias", label: "Denúncias" },
      solicitarpremiacao: { emoji: "🏆", color: "#E74C3C", description: "🏆 Solicitar Premiação", label: "Solicitar Premiação" },
    };
    const ticketCategory = ticketTypes[ticketType];
    if (!ticketCategory) {
      interaction.reply({
        content: `Tipo de ticket inválido.`,
        ephemeral: true,
      });
      return;
    }
    const dbMember = await db.members.get({
      id: user.id,
      guild: { id: guild.id },
    });
    const existingTicket = guild.channels.cache.get(dbMember.ticketAberto);
    if (existingTicket) {
      await interaction.reply({
        content: `Você já tem um ticket aberto: ${existingTicket}. Por favor, feche o ticket existente antes de abrir um novo.`,
        ephemeral: true,
      });
      return;
    }
    const ticketCategories = {
      suporte: logChannels.categoria_suporte,
      denuncias: logChannels.categoria_denuncias,
      solicitarpremiacao: logChannels.categoria_solicitarpremiacao,
    };
    const ticketCategoryId = ticketCategories[ticketType];
    if (!ticketCategoryId) {
      interaction.reply({
        content: `Categoria de ticket inválida.`,
        ephemeral: true,
      });
      return;
    }
    const channelName = `${ticketCategory.emoji}︲ticket-${user.username}`;
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: ticketCategories[ticketType],
      topic: `Ticket aberto por: ${user.id}`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: cargoPermissaoId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });
    await db.members.findOneAndUpdate(
      { id: user.id, guildId: guild.id },
      { ticketAberto: ticketChannel.id },
      { upsert: true }
    );
    const abertoHora = Math.floor(ticketChannel.createdTimestamp / 1000);
    await db.tickets.create({
      id: ticketChannel.id,
      guildId: guild.id,
      ownerId: user.id,
      emoji: ticketCategory.emoji,
      createdAt: abertoHora.toString(),
      label: ticketCategory.label,
      category: ticketType,
    });
    const logEmbed = new EmbedBuilder().setColor(hexColor).setAuthor({
      name: `${interaction.guild.name} | Sistema de LOG's`,
      iconURL: interaction.guild.iconURL() ?? undefined,
    }).setDescription(`## \`📭 Ticket aberto com sucesso!\`
        > __**Informações do evento:**__
         - ⏰ **Horário da criação:** <t:${Math.floor(Date.now() / 1000)}:F>
         - ❓ **Categoria:** \`${ticketCategory.description}\`

        > __**Informações do ticket:**__
         - 🔢 **ID do Ticket:** \`${ticketChannel.id}\`
         - 🙋 **Autor do ticket:** [<@${user.id}> / \`${user.id}\`]`);
    const logChannel = interaction.guild.channels.cache.get(canal_logs_id);
    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send({ embeds: [logEmbed] });
    }
    const embedTicket = new EmbedBuilder()
      .setColor(hexColor)
      .setTitle(`Ticket Criado com Sucesso! 📌`)
      .setThumbnail(user.displayAvatarURL())
      .setDescription(
        `Todos os responsáveis pelo ticket já estão cientes da abertura\nEvite chamar alguém via DM, basta aguardar alguém já irá lhe atender...\n\n__**Categoria Escolhida:**__\n\`\`\`${ticketCategory.description}\`\`\`\nLembrando que os botões são exclusivos para staffs!\n\n**\`DESCREVA O MOTIVO DO CONTATO COM O MÁXIMO DE DETALHES POSSÍVEIS QUE ALGUM RESPONSÁVEL JÁ IRÁ LHE ATENDER!\`**`
      );
    const embedTicket2 = new EmbedBuilder()
      .setColor(hexColor)
      .setDescription(
        "**`OBS: Procure manter a sua DM aberta para receber uma cópia deste ticket`**"
      );
    const cancelButton = new ButtonBuilder()
      .setCustomId("t/cancel_ticket")
      .setLabel("Desejo sair ou cancelar este ticket")
      .setEmoji("1155738247805292555")
      .setStyle(ButtonStyle.Danger);
    const botaodm = new ButtonBuilder()
      .setCustomId("t/botaodm")
      .setLabel("Como libero minha DM?")
      .setEmoji("❓")
      .setStyle(ButtonStyle.Danger);
    const closeButton = new ButtonBuilder()
      .setCustomId("t/close_ticket")
      .setLabel("Finalizar atendimento")
      .setEmoji("1115405910337146971")
      .setStyle(ButtonStyle.Success);
    const nomeBotao = new ButtonBuilder()
      .setCustomId("t/nomeBotao")
      .setLabel("Trocar Nome do Ticket")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Secondary);
    const addUser = new ButtonBuilder()
      .setCustomId("t/addUser")
      .setLabel("Adicionar usuário")
      .setEmoji("1248121416134430720")
      .setStyle(ButtonStyle.Secondary);
    const remUser = new ButtonBuilder()
      .setCustomId("t/remUser")
      .setLabel("Remover usuário")
      .setEmoji("1248121428474335354")
      .setStyle(ButtonStyle.Secondary);
    const assumirAtend = new ButtonBuilder()
      .setCustomId("t/assumirAtend")
      .setLabel("Assumir atendimento")
      .setEmoji("😉")
      .setStyle(ButtonStyle.Primary);
    const greetButton = new ButtonBuilder()
      .setCustomId("t/greet_ticket")
      .setLabel("Saudações!")
      .setEmoji("👋")
      .setStyle(ButtonStyle.Primary);
    const notifyButton = new ButtonBuilder()
      .setCustomId("t/notify_member")
      .setLabel("Notificar membro")
      .setEmoji("🔔")
      .setStyle(ButtonStyle.Secondary);
    const actionRow1 = new ActionRowBuilder().addComponents(
      cancelButton,
      botaodm
    );
    const actionRow2 = new ActionRowBuilder().addComponents(
      addUser, // staff
      remUser, // staff
      notifyButton, // staff
      nomeBotao // staff
    );
    const actionRow3 = new ActionRowBuilder().addComponents(
      assumirAtend, // staff
      greetButton, // staff
      closeButton // staff
    );
    await ticketChannel.send({
      content: `<@${user.id}>`,
      embeds: [embedTicket, embedTicket2],
      components: [actionRow1, actionRow2, actionRow3],
    });
    await interaction.reply({
      content: `Ticket criado com sucesso: ${ticketChannel}`,
      ephemeral: true,
    });
  },
});
new Responder({
  customId: "t/:action",
  type: ResponderType.Button,
  cache: "cached",
  async run(interaction, { action }) {
    switch (action) {
      case "assumirAtend": {
        const logChannels = await loadLogChannels();
        const cargoPermissaoId = logChannels.cargoticket;
        const canal_logs_id = logChannels.canallogsticket;
        const canal_gerais_id = logChannels.canalgeralticket;
        if (
          !interaction.member.roles.cache.has(cargoPermissaoId) &&
          !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          await interaction.reply({
            content: `Você não tem permissão para assumir o atendimento.`,
            ephemeral: true,
          });
          return;
        }
        const member = interaction.member;
        const displayName = member.displayName;
        const newButton = new ButtonBuilder()
          .setCustomId("t/assumirAtend")
          .setLabel(`Assumido por: ${displayName}`)
          .setEmoji("😉")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true);
        const cancelButton = new ButtonBuilder()
          .setCustomId("t/cancel_ticket")
          .setLabel("Desejo sair ou cancelar este ticket")
          .setEmoji("1155738247805292555")
          .setStyle(ButtonStyle.Danger);
        const botaodm = new ButtonBuilder()
          .setCustomId("t/botaodm")
          .setLabel("Como libero minha DM?")
          .setEmoji("❓")
          .setStyle(ButtonStyle.Danger);
        const closeButton = new ButtonBuilder()
          .setCustomId("t/close_ticket")
          .setLabel("Finalizar atendimento")
          .setEmoji("1115405910337146971")
          .setStyle(ButtonStyle.Success);
        const nomeBotao = new ButtonBuilder()
          .setCustomId("t/nomeBotao")
          .setLabel("Trocar Nome do Ticket")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Secondary);
        const addUser = new ButtonBuilder()
          .setCustomId("t/addUser")
          .setLabel("Adicionar usuário")
          .setEmoji("1248121416134430720")
          .setStyle(ButtonStyle.Secondary);
        const remUser = new ButtonBuilder()
          .setCustomId("t/remUser")
          .setLabel("Remover usuário")
          .setEmoji("1248121428474335354")
          .setStyle(ButtonStyle.Secondary);
        const greetButton = new ButtonBuilder()
          .setCustomId("t/greet_ticket")
          .setLabel("Saudações!")
          .setEmoji("👋")
          .setStyle(ButtonStyle.Primary);
        const notifyButton = new ButtonBuilder()
          .setCustomId("t/notify_member")
          .setLabel("Notificar membro")
          .setEmoji("🔔")
          .setStyle(ButtonStyle.Secondary);
        const newActionRow1 = new ActionRowBuilder().addComponents(
          cancelButton,
          botaodm
        );
        const newActionRow2 = new ActionRowBuilder().addComponents(
          addUser,
          remUser,
          notifyButton,
          nomeBotao
        );
        const newActionRow3 = new ActionRowBuilder().addComponents(
          newButton,
          greetButton,
          closeButton
        );
        await interaction.deferUpdate();
        await interaction.message.edit({
          components: [newActionRow1, newActionRow2, newActionRow3],
        });

        const hexColor = logChannels.cor || "0x2b2d31";

        const logEmbed = new EmbedBuilder()
          .setColor(hexColor)
          .setAuthor({
            name: `${interaction.guild.name} | Sistema de LOG's`,
            iconURL: interaction.guild.iconURL() ?? undefined,
          })
          .setDescription(
            `## \`📌 Ticket Assumido!\`\n> __**Informações do evento:**__\n- 👮 **Staff que assumiu:** [<@${
              interaction.member.id
            }> / \`${member.id}\`]\n- ⏰ **Horário:** <t:${Math.floor(
              Date.now() / 1000
            )}:F>\n\n> __**Informações do ticket:**__\n- 🔢 **ID:** \`${
              interaction.channelId
            }\``
          );
        const logChannel =
          interaction.guild.channels.cache.get(canal_gerais_id);
        if (logChannel && logChannel.isTextBased()) {
          await logChannel.send({ embeds: [logEmbed] });
        }
        break;
      }
      case "cancel_ticket": {
        const logChannels = await loadLogChannels();
        const cargoPermissaoId = logChannels.cargoticket;
        const canal_logs_id = logChannels.canallogsticket;
        const canal_gerais_id = logChannels.canalgeralticket;
        const ticketDb = await db.tickets.get(interaction.channel?.id);
        if (!ticketDb) return;
        const owner = interaction.guild.members.cache.get(ticketDb.ownerId);
        if (!owner) {
          await interaction.reply({
            content: `O autor do ticket não foi encontrado.`,
            ephemeral: true,
          });
          return;
        }
        if (interaction.user.id !== owner.id) {
          await interaction.reply({
            content: `Somente o autor do ticket pode cancelar o atendimento.`,
            ephemeral: true,
          });
          return;
        }
        const channel = interaction.channel;
        if (channel && channel.isTextBased()) {
          const authorPermission = channel.permissionOverwrites.cache.get(
            owner.id
          );
          if (authorPermission) {
            await authorPermission.delete();
            await interaction.reply(
              `O autor <@${owner.id}> resolveu sair do ticket.\n\n> Para evitar que o usuário abra outros canais de atendimento e fique saindo, este canal está pendente para ser finalizado pela equipe.\n> Enquanto este canal não for finalizado, o autor não poderá abrir outros canais de atendimento no servidor.\n\nEste canal pode ser finalizado a qualquer momento! 📌`
            );
          } else {
            await interaction.reply({
              content: `Não foi possível encontrar as permissões do autor neste canal.`,
              ephemeral: true,
            });
          }
        } else {
          await interaction.reply({
            content: `Canal não encontrado ou não é um canal de texto.`,
            ephemeral: true,
          });
        }
        break;
      }
      case "addUser": {
        const logChannels = await loadLogChannels();
        const cargoPermissaoId = logChannels.cargoticket;
        const canal_logs_id = logChannels.canallogsticket;
        const canal_gerais_id = logChannels.canalgeralticket;
        if (
          !interaction.member.roles.cache.has(cargoPermissaoId) &&
          !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          await interaction.reply({
            content: `Você não tem permissão para adicionar usuários a este ticket.`,
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content:
            "Por favor, mencione o usuário ou forneça o ID do Discord do usuário que deseja adicionar.",
          ephemeral: true,
        });
        const filter = (m) => m.author.id === interaction.user.id;
        const collector = interaction.channel?.createMessageCollector({
          filter,
          max: 1,
        });
        collector?.on("collect", async (message) => {
          const userId = message.content.replace(/[<@!>]/g, "");
          const member = await interaction.guild.members
            .fetch(userId)
            .catch(() => null);
          if (member) {
            const channel = interaction.channel;
            if (channel && channel.isTextBased()) {
              await channel.permissionOverwrites.create(member, {
                ViewChannel: true,
                SendMessages: true,
              });

              let logChannels;
              try {
                logChannels = JSON.parse(
                  fs.readFileSync("./logChannels.json", "utf-8")
                );
              } catch (error) {
                console.error("Erro ao ler logChannels.json:", error);
                return;
              }

              const hexColor = logChannels.cor || "0x2b2d31";

              const embed = new EmbedBuilder()
                .setColor(hexColor)
                .setAuthor({
                  name: `${interaction.user.username}#0 <<-- Staff que Adicionou`,
                  iconURL: interaction.user.displayAvatarURL(),
                })
                .setDescription(
                  `🔓 Usuário adicionado com sucesso aqui!\n\nUsuário: <@${member.id}>\nID: ${member.id}`
                );
              const welcomeMessage = `<@${member.id}>`;
              await interaction.followUp({
                content: welcomeMessage,
                embeds: [embed],
                ephemeral: false,
              });
              const privateEmbed = new EmbedBuilder()
                .setColor(hexColor)
                .setAuthor({
                  name: `Adicionado em um Ticket!`,
                })
                .setThumbnail(interaction.guild.iconURL() ?? null)
                .setDescription(
                  `Olá, <@${member.id}>!\n\nO membro da nossa equipe <@${interaction.user.id}> te adicionou em um ticket.\nO mesmo está aguardando você em nosso ticket...`
                )
                .setFooter({
                  text: `O servidor ${interaction.guild.name} agradece a sua colaboração!`,
                });
              const ticketButton = new ButtonBuilder()
                .setLabel("Visualizar Ticket")
                .setEmoji("❓")
                .setStyle(ButtonStyle.Link)
                .setURL(channel.url);
              await member.send({
                embeds: [privateEmbed],
                components: [
                  new ActionRowBuilder().addComponents(ticketButton),
                ],
              });
              const logEmbed = new EmbedBuilder()
                .setColor(hexColor)
                .setAuthor({
                  name: `${interaction.guild.name} | Sistema de LOG's`,
                  iconURL: interaction.guild.iconURL() ?? undefined,
                })
                .setDescription(
                  `## \`🔓 Usuário Adicionado ao Ticket!\`\n> __**Informações do evento:**__\n- 👮 **Staff que adicionou:** [${
                    interaction.user
                  } / \`${
                    interaction.user.id
                  }\`]\n- ⏰ **Horário da adição:** <t:${Math.floor(
                    Date.now() / 1000
                  )}:F>\n\n> __**Informações do ticket:**__\n- 🔢 **ID do Ticket:** \`${
                    interaction.channelId
                  }\`\n- 🙋 **Usuário adicionado:** [<@${member.id}> / \`${
                    member.id
                  }\`]`
                );
              const logChannel =
                interaction.guild.channels.cache.get(canal_gerais_id);
              if (logChannel && logChannel.isTextBased()) {
                await logChannel.send({ embeds: [logEmbed] });
              }
              await message.delete();
            } else {
              const embed = new EmbedBuilder()
                .setColor("#FF0000")
                .setDescription(
                  "Canal não encontrado ou não é um canal de texto."
                );
              await interaction.followUp({ embeds: [embed], ephemeral: true });
            }
          } else {
            const embed = new EmbedBuilder()
              .setColor("#FF0000")
              .setDescription(
                "Usuário não encontrado. Por favor, mencione um usuário válido ou forneça um ID correto."
              );
            await interaction.followUp({ embeds: [embed], ephemeral: true });
          }
          collector.stop();
        });
        break;
      }
      case "remUser": {
        const logChannels = await loadLogChannels();
        const cargoPermissaoId = logChannels.cargoticket;
        const canal_logs_id = logChannels.canallogsticket;
        const canal_gerais_id = logChannels.canalgeralticket;
        if (
          !interaction.member.roles.cache.has(cargoPermissaoId) &&
          !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          await interaction.reply({
            content: `Você não tem permissão para remover usuários deste ticket.`,
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content:
            "Por favor, mencione o usuário ou forneça o ID do Discord do usuário que deseja remover.",
          ephemeral: true,
        });
        const filter = (m) => m.author.id === interaction.user.id;
        const collector = interaction.channel?.createMessageCollector({
          filter,
          max: 1,
        });
        collector?.on("collect", async (message) => {
          const userId = message.content.replace(/[<@!>]/g, "");
          const member = await interaction.guild.members
            .fetch(userId)
            .catch(() => null);
          if (member) {
            const channel = interaction.channel;
            if (channel && channel.isTextBased()) {
              await channel.permissionOverwrites.delete(member.id);

              let logChannels;
              try {
                logChannels = JSON.parse(
                  fs.readFileSync("./logChannels.json", "utf-8")
                );
              } catch (error) {
                console.error("Erro ao ler logChannels.json:", error);
                return;
              }

              const hexColor = logChannels.cor || "0x2b2d31";

              const logEmbed = new EmbedBuilder()
                .setColor(hexColor)
                .setAuthor({
                  name: `${interaction.guild.name} | Sistema de LOG's`,
                  iconURL: interaction.guild.iconURL() ?? undefined,
                })
                .setDescription(
                  `## \`🔐 Usuário Removido do Ticket!\`\n> __**Informações do evento:**__\n- 👮 **Staff que removeu:** [${
                    interaction.user
                  } / \`${
                    interaction.user.id
                  }\`]\n- ⏰ **Horário da remoção:** <t:${Math.floor(
                    Date.now() / 1000
                  )}:F>\n\n> __**Informações do ticket:**__\n- 🔢 **ID do Ticket:** \`${
                    interaction.channelId
                  }\`\n- 🙋 **Usuário removido:** [<@${member.id}> / \`${
                    member.id
                  }\`]`
                );
              const logChannel =
                interaction.guild.channels.cache.get(canal_gerais_id);
              if (logChannel && logChannel.isTextBased()) {
                await logChannel.send({ embeds: [logEmbed] });
              }
              const embed = new EmbedBuilder()
                .setColor(hexColor)
                .setAuthor({
                  name: `${interaction.user.username}#0 <<-- Staff que Removeu`,
                  iconURL: interaction.user.displayAvatarURL(),
                })
                .setDescription(
                  `🔒 Usuário removido com sucesso!\n\nUsuário: <@${member.id}>\nID: ${member.id}`
                );
              await interaction.followUp({ embeds: [embed], ephemeral: false });
              await message.delete();
            } else {
              const embed = new EmbedBuilder()
                .setColor("#FF0000")
                .setDescription(
                  "Canal não encontrado ou não é um canal de texto."
                );
              await interaction.followUp({ embeds: [embed], ephemeral: true });
            }
          } else {
            const embed = new EmbedBuilder()
              .setColor("#FF0000")
              .setDescription(
                "Usuário não encontrado. Por favor, mencione um usuário válido ou forneça um ID correto."
              );
            await interaction.followUp({ embeds: [embed], ephemeral: true });
          }
          collector.stop();
        });
        break;
      }
      case "close_ticket": {
          const logChannels = await loadLogChannels();
          const cargoPermissaoId = logChannels.cargoticket;
          const canal_logs_id = logChannels.canallogsticket;
          const canal_gerais_id = logChannels.canalgeralticket;
      
          if (
              !interaction.member.roles.cache.has(cargoPermissaoId) &&
              !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
          ) {
              await interaction.reply({
                  content: `Você não tem permissão para finalizar este atendimento.`,
                  ephemeral: true,
              });
              return;
          }
      
          try {
              await db.tickets.updateOne(
                { id: interaction.channelId },
                { $set: { finalizadoPor: interaction.user.id, finalizadoEm: new Date() } }
            );            
      
              let transcript = await createTranscript(interaction.channel, {
                  filename: `ticket-${interaction.channelId}.html`,
                  saveImages: true,
                  poweredBy: false,
              });
      
              const finalizadoHora = Math.floor(Date.now() / 1000);
              if (!transcript || typeof transcript !== "object" || !transcript.attachment) {
                  await interaction.reply({
                      content: "❌ Erro ao criar este transcript para o servidor. Tente novamente mais tarde.",
                      ephemeral: true,
                  });
                  return;
              }
      
              const form = new FormData();
              form.append("file", transcript.attachment, `ticket-${interaction.channelId}.html`);
              const response = await axios.post("http://45.146.81.145/upload", form, {
                  headers: form.getHeaders(),
              });
      
              if (response.status !== 200) {
                  await interaction.reply({
                      content: "❌ Erro ao enviar este transcript para o servidor. Tente novamente mais tarde.",
                      ephemeral: true,
                  });
                  return;
              }
      
              let ticketData = await db.tickets.findOne({ id: interaction.channelId });
              if (!ticketData) {
                  await interaction.reply({
                      content: "❌ Não encontrei os dados deste ticket no meu banco de dados. Deletando este atendimento...",
                      ephemeral: true,
                  });
                  setTimeout(async () => {
                      await interaction.channel?.delete();
                  }, 5000);
                  return;
              }
      
              let log = interaction.guild.channels.cache.get(canal_logs_id);
              if (log && log.isTextBased()) {
                  const hexColor = logChannels.cor || "0x2b2d31";
                  const embedlog = new EmbedBuilder()
                      .setColor(hexColor)
                      .setAuthor({
                          name: `${interaction.guild.name} | Sistema de LOG's`,
                          iconURL: interaction.guild.iconURL() ?? undefined,
                      })
                      .setDescription(`## \`📪 Ticket Finalizado com sucesso!\`
                          > __**Informações do evento:**__
                           - 👮 **Staff que finalizou:** [${interaction.user} / \`${interaction.user.id}\`]
                           - ⏰ **Horário que foi finalizado:** <t:${finalizadoHora}:F>
                           - ❓ **Categoria:** \`${ticketData.emoji} ${ticketData.label}\`\n\n> __**Informações do ticket:**__\n- ⏰ **Aberto:** <t:${ticketData.createdAt}:R>\n- 🔢 **ID:** \`${interaction.channelId}\`\n- 🙋 **Autor do ticket:** [<@${ticketData?.ownerId}> / \`${ticketData?.ownerId}\`]\n- 🔑 **Senha do Ticket:** || ${ticketData.ticketPassword} ||`);
      
                  let row = new ActionRowBuilder().addComponents(
                      new ButtonBuilder({
                          style: ButtonStyle.Link,
                          label: "Acessar Transcript",
                          url: `http://45.146.81.145/transcript/ticket-${interaction.channelId}`,
                      }),
                      new ButtonBuilder({
                          customId: "senha_transcript",
                          label: `Senha: ${ticketData.ticketPassword }`,
                          style: ButtonStyle.Secondary,
                          disabled: true,
                      })
                  );
                  await log.send({ embeds: [embedlog], components: [row] });
              }
      
              const owner = interaction.guild.members.cache.get(ticketData.ownerId);
              if (owner) {
                  await owner?.send({ content: "> Gerando transcript..." })
                      .then(async (msg) => {
                          const hexColor = logChannels.cor || "0x2b2d31";
                          const embed = new EmbedBuilder()
                              .setColor(hexColor)
                              .setAuthor({
                                  name: `Ticket Finalizado!`,
                                  iconURL: interaction.guild.iconURL() ?? undefined,
                              })
                              .setDescription(
                                  `- 👮 **Staff que finalizou:** [${interaction.user} / \`${interaction.user.id}\`]\n- 🔢 **ID do seu ticket:** \`${interaction.channelId}\`\n- ❓ **Categoria:** \`${ticketData.emoji} ${ticketData.label}\`\n- 🔑 **Senha do Ticket:** ||${ticketData.ticketPassword}||\n\nSe precisar de mais assistência, sinta-se à vontade para abrir um novo ticket. E caso você tenha algum tipo de dúvida referente ao seu ticket, basta acessar o transcript anexado no botão abaixo!`
                              );
      
                          const linkButton = new ButtonBuilder()
                              .setLabel("Acessar Transcript")
                              .setStyle(ButtonStyle.Link)
                              .setURL(`http://45.146.81.145/transcript/ticket-${interaction.channelId}`);
      
                          const BotaoSenha = new ButtonBuilder()
                              .setCustomId("senha_ticket")
                              .setLabel(`Senha: ${ticketData.ticketPassword}`)
                              .setStyle(ButtonStyle.Secondary)
                              .setDisabled(true);
      
                          await msg.edit({
                              content: "",
                              embeds: [embed],
                              components: [
                                  new ActionRowBuilder().addComponents(linkButton, BotaoSenha),
                              ],
                          });
                      })
                      .catch((err) => {
                          if (err.code === 50007) return;
                          console.error(err);
                      });
              }
      
              await interaction.channel?.delete();
          } catch (error) {
              await interaction.reply({
                  content: "**Erro ao finalizar o ticket, tente novamente**",
                  ephemeral: true,
              });
              console.error(error);
          }
          break;
      }
      case "greet_ticket": {
        const logChannels = await loadLogChannels();
        const cargoPermissaoId = logChannels.cargoticket;
        const canal_logs_id = logChannels.canallogsticket;
        const canal_gerais_id = logChannels.canalgeralticket;
        if (
          !interaction.member.roles.cache.has(cargoPermissaoId) &&
          !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          await interaction.reply({
            content: `Você não tem permissão para enviar saudações.`,
            ephemeral: true,
          });
          return;
        }
        const ticketData = await db.tickets.findOne({
          id: interaction.channelId,
        });
        if (!ticketData) {
          await interaction.reply({
            content: `Erro ao obter dados do ticket na database.`,
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: `Olá <@${ticketData?.ownerId}>,\n\nBem-vindo ao suporte do **${interaction.guild.name}**. Meu nome é ${interaction.user}. Como posso atendê-lo(a)?`,
          ephemeral: false,
        });
        break;
      }
      case "botaodm": {
        await interaction.reply({
          content:
            "> __**Como fazer isso?**__\n\n**1 -** Clique no ícone `⚙️ Configurações de Usuário` ao lado de desativar seu áudio no Discord.\n**2 -** Procure e selecione a opção `Privacidade e Segurança` que está abaixo de `Perfis`.\n**3 -** Role para baixo nas opções que apareceram e habilite `Permitir mensagens diretas de membros do servidor`.\n\n**Pronto, você já poderá receber as notificações minhas direto no seu privado.**",
          ephemeral: true,
        });
        break;
      }
      case "notify_member": {
        const logChannels = await loadLogChannels();
        const cargoPermissaoId = logChannels.cargoticket;
        const canal_logs_id = logChannels.canallogsticket;
        const canal_gerais_id = logChannels.canalgeralticket;
        if (
          !interaction.member.roles.cache.has(cargoPermissaoId) &&
          !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          interaction.reply({
            content: `Você não tem permissão para notificar o membro.`,
            ephemeral: true,
          });
          return;
        }
        const ticketData = await db.tickets.findOne({
          id: interaction.channelId,
        });
        const user = interaction.guild.members.cache.get(
          ticketData?.ownerId
        ).user;
        await interaction.reply({
          content:
            "`Tentando enviar uma mensagem direta para o jogador no privado...`",
          ephemeral: true,
        });

        const hexColor = logChannels.cor || "0x2b2d31";

        const notifyEmbed = new EmbedBuilder()
          .setColor(hexColor)
          .setAuthor({
            name: `${interaction.user.username}#0 <<-- Staff que Notificou`,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setDescription(
            `😴 Usuário notificado com sucesso!\n\nUsuário: ${user.tag}\n\nDaqui a pouco ele deve aparecer...`
          )
          .setFooter({ text: `✅ Mensagem enviada com sucesso pelo usuário!` });
        await interaction.channel?.send({
          content: `<@${user.id}>`,
          embeds: [notifyEmbed],
        });
        const userEmbed = new EmbedBuilder()
          .setColor(hexColor)
          .setTitle(`NOTIFICAÇÃO`)
          .setDescription(
            `Olá, tudo bem?\n\nVocê foi notificado por um membro da nossa equipe, caso não compareça neste ticket: ${interaction.channel} o atendimento será encerrado por inatividade.`
          )
          .setFooter({ text: `©️ ${interaction.guild.name}` });
        const visualizarTicket = new ButtonBuilder()
          .setLabel(`Visualizar Ticket`)
          .setStyle(ButtonStyle.Link)
          .setURL(interaction.channel?.url);
        await user.send({
          embeds: [userEmbed],
          components: [
            {
              type: 1,
              components: [visualizarTicket],
            },
          ],
        });
        const logEmbed = new EmbedBuilder()
          .setColor(hexColor)
          .setAuthor({
            name: `${interaction.guild.name} | Sistema de LOG's`,
            iconURL: interaction.guild.iconURL() ?? undefined,
          })
          .setDescription(
            `## \`🔔 Notificação Enviada!\`\n> __**Informações do evento:**__\n- 👮 **Staff que notificou:** [${
              interaction.user
            } / \`${
              interaction.user.id
            }\`]\n- ⏰ **Horário da notificação:** <t:${Math.floor(
              Date.now() / 1000
            )}:F>\n- 🙋 **Usuário notificado:** [${user.tag} / \`${user.id}\`]`
          );
        const logChannel =
          interaction.guild.channels.cache.get(canal_gerais_id);
        if (logChannel && logChannel.isTextBased()) {
          await logChannel.send({ embeds: [logEmbed] });
        }
        break;
      }
      case "nomeBotao": {
        const logChannels = await loadLogChannels();
        const cargoPermissaoId = logChannels.cargoticket;
        const canal_logs_id = logChannels.canallogsticket;
        const canal_gerais_id = logChannels.canalgeralticket;
        if (
          !interaction.member.roles.cache.has(cargoPermissaoId) &&
          !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          await interaction.reply({
            content: `Você não tem permissão para alterar o nome do canal.`,
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: "Qual será o novo nome do canal?",
          ephemeral: true,
        });
        const filter = (m) => m.author.id === interaction.user.id;
        const collector = interaction.channel?.createMessageCollector({
          filter,
          max: 1,
          time: 30000,
        });
        collector.on("collect", async (message) => {
          const newChannelName = message.content;
          const ticketu = await db.tickets.findOne({
            id: interaction.channelId,
          });
          const formattedChannelName = `${
            ticketu?.emoji ?? "🎫"
          }・${newChannelName}`;
          if (!interaction.channel) {
            await interaction.reply({
              content: "Erro: O canal de interação não foi encontrado.",
              ephemeral: true,
            });
            return;
          }
          const oldChannelName = interaction.channel.name;
          await interaction.channel.setName(formattedChannelName);
          await message.delete();
          await interaction.followUp({
            content: `O nome do canal foi alterado para: **${formattedChannelName}**`,
            ephemeral: true,
          });

          let logChannels;
          try {
            logChannels = JSON.parse(
              fs.readFileSync("./logChannels.json", "utf-8")
            );
          } catch (error) {
            console.error("Erro ao ler logChannels.json:", error);
            return;
          }

          const hexColor = logChannels.cor || "0x2b2d31";

          const logEmbed = new EmbedBuilder()
            .setColor(hexColor)
            .setAuthor({
              name: `${interaction.guild.name} | Sistema de LOG's`,
              iconURL: interaction.guild.iconURL() ?? undefined,
            })
            .setDescription(
              `## \`📝 Ticket Renomeado com sucesso!\`\n> __**Informações do evento:**__\n- 👮 **Staff que alterou:** [${
                interaction.user
              } / \`${
                interaction.user.id
              }\`]\n- ⏰ **Horário da alteração:** <t:${Math.floor(
                Date.now() / 1000
              )}:F>\n- 🔄 **Nome Antigo:** ${oldChannelName}\n- 🔄 **Novo Nome:** ${formattedChannelName}\n- 🔢 **ID do Ticket:** \`${
                interaction.channelId
              }\``
            );
          const logChannel =
            interaction.guild.channels.cache.get(canal_gerais_id);
          if (logChannel && logChannel.isTextBased()) {
            await logChannel.send({ embeds: [logEmbed] });
          }
          collector.stop();
        });
        collector.on("end", (collected) => {
          if (collected.size === 0) {
            interaction.followUp({
              content: "Tempo esgotado! Você não respondeu a tempo.",
              ephemeral: true,
            });
          }
        });
        break;
      }
    }
  },
});