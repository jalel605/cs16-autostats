const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Gamedig = require('gamedig');
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

// --- Web Server Section (for Render Keep-Alive) ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('CS 1.6 Bot is Online and Refreshing Stats! 🟢');
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});
// --------------------------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Map to store active refresh intervals by channel ID
const activeStats = new Map();

const TOKEN = process.env.DISCORD_TOKEN; 

// --- Function to get GameTracker.com Rank ---
async function getGameTrackerRank_COM(ip, port) {
    const url = `https://www.gametracker.com/server_info/${ip}:${port}/`;
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'CS16-Stats-Bot' } });
        const $ = cheerio.load(response.data);
        let rankText = $('td:contains("Global Rank")').next('td').text().trim();

        if (rankText && rankText !== '-') {
            return rankText.split('(')[0].trim();
        } else {
            return "Not Listed/Unknown";
        }
    } catch (error) {
        return "❌ GT.COM Connection Failed";
    }
}

// --- Function to get GameTracker.rs Rank ---
async function getGameTrackerRank_RS(ip, port) {
    const url = `https://www.gametracker.rs/server_info/${ip}:${port}/`;
    
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'CS16-Stats-Bot' } });
        const $ = cheerio.load(response.data);
        let rankText = $('td:contains("Global Rank")').next('td').text().trim();

        if (rankText && rankText !== '-') {
            return rankText.split('(')[0].trim();
        } else {
            return "Not Listed/Unknown";
        }

    } catch (error) {
        return "❌ GT.RS Connection Failed";
    }
}

// --- The core refresh function (called every 60 seconds) ---
async function refreshStats(sentMessage, ip, port) {
    let state = null;
    let gtRank_COM = "Fetching...";
    let gtRank_RS = "Fetching...";

    try {
        state = await Gamedig.query({ type: 'cs16', host: ip, port: parseInt(port) });
        gtRank_COM = await getGameTrackerRank_COM(ip, port); 
        gtRank_RS = await getGameTrackerRank_RS(ip, port); 
        
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`📊 Server Stats: ${state.name}`)
            .addFields(
                { name: '🗺️ Map', value: state.map, inline: true },
                { name: '👥 Players', value: `${state.players.length}/${state.maxplayers}`, inline: true },
                { name: '📶 Ping', value: `${state.ping}ms`, inline: true },
                { name: '🏆 GameTracker.com Rank', value: gtRank_COM, inline: true }, 
                { name: '🇷🇸 GameTracker.rs Rank', value: gtRank_RS, inline: true }, 
                { name: '\u200B', value: '\u200B', inline: true }, 
                { name: '🔗 Quick Connect', value: `steam://connect/${ip}:${port}` }
            )
            .setFooter({ text: `Last Updated: ${new Date().toLocaleTimeString()} | CS 1.6 Bot | Powered by GlaD` }) 
            .setTimestamp();
        
        await sentMessage.edit({ content: ' ', embeds: [embed] });

    } catch (error) {
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`⚠️ Update Failed: ${ip}:${port}`)
            .setDescription('❌ Server connection failed. Check IP. Retrying in next cycle.')
            .setFooter({ text: `Last Attempt: ${new Date().toLocaleTimeString()}` });

        await sentMessage.edit({ content: ' ', embeds: [errorEmbed] });
        console.error('Error during refresh:', error.message);
    }
}
// --------------------------------------------------------

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    client.user.setActivity('Auto-Refreshing Stats', { type: 'Watching' });
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.startsWith('!stats')) {
        const args = message.content.split(' ');

        if (activeStats.has(message.channel.id)) {
            return message.reply('🔄 Stats display already active in this channel. Use `!stopstats` to stop it first.');
        }
        
        if (args.length < 2) {
            return message.reply('❌ Please use the correct format:\n`!stats IP:PORT`');
        }

        const ipPort = args[1].split(':');
        const ip = ipPort[0];
        const port = ipPort[1] || 27015;

        const sentMessage = await message.reply('🔄 Starting automatic stats refresh...');
        await refreshStats(sentMessage, ip, port);

        const intervalId = setInterval(() => {
            refreshStats(sentMessage, ip, port);
        }, 60000); // 60 seconds

        activeStats.set(message.channel.id, intervalId);

    } else if (message.content.startsWith('!stopstats')) {
        const intervalId = activeStats.get(message.channel.id);

        if (intervalId) {
            clearInterval(intervalId);
            activeStats.delete(message.channel.id);
            message.reply('🛑 Automatic server stats refresh stopped.');
        } else {
            message.reply('⚠️ No active stats refresh running in this channel.');
        }
    }
});

client.login(TOKEN);