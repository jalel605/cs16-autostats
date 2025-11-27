const { WebhookClient, EmbedBuilder } = require('discord.js');
const Gamedig = require('gamedig');
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

// --- إعدادات السيرفر والويب هوك ---
const WEBHOOK_URL = process.env.WEBHOOK_URL; 
const SERVER_IP = process.env.SERVER_IP || '127.0.0.1';
const SERVER_PORT = parseInt(process.env.SERVER_PORT) || 27015;

// --- Web Server Section ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('CS 1.6 Webhook Monitor is Online! 🟢');
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});
// --------------------------------------------------

const webhookClient = new WebhookClient({ url: WEBHOOK_URL });

// --- Function to get GameTracker.com Rank ---
async function getGameTrackerRank_COM(ip, port) {
    const url = `https://www.gametracker.com/server_info/${ip}:${port}/`;
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'CS16-Stats-Bot' }, timeout: 5000 });
        const $ = cheerio.load(response.data);
        let rankText = $('td:contains("Global Rank")').next('td').text().trim();
        return (rankText && rankText !== '-') ? `#${rankText.split('(')[0].trim()}` : "Not Listed";
    } catch (error) {
        return "N/A";
    }
}

// --- Function to get GameTracker.rs Rank ---
async function getGameTrackerRank_RS(ip, port) {
    const url = `https://www.gametracker.rs/server_info/${ip}:${port}/`;
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'CS16-Stats-Bot' }, timeout: 5000 });
        const $ = cheerio.load(response.data);
        let rankText = $('td:contains("Global Rank")').next('td').text().trim();
        return (rankText && rankText !== '-') ? `#${rankText.split('(')[0].trim()}` : "Not Listed";
    } catch (error) {
        return "N/A";
    }
}

// دالة تنسيق قائمة اللاعبين
function formatPlayerList(players) {
    if (!players || players.length === 0) return "😴 No players online";
    
    // نأخذ أول 15 لاعب فقط لكي لا تصبح الرسالة طويلة جداً
    const maxShow = 15;
    const cleanPlayers = players.map(p => p.name.replace(/`/g, '')); // إزالة الرموز التي تخرب الشكل
    
    let listStr = cleanPlayers.slice(0, maxShow).join('\n');
    
    if (players.length > maxShow) {
        listStr += `\n...and ${players.length - maxShow} more`;
    }
    
    // وضعناها داخل ``` لكي تظهر بشكل منظم
    return `\`\`\`\n${listStr}\n\`\`\``;
}

// دالة لجلب المعلومات وإنشاء الـ Embed
async function createStatusEmbed() {
    try {
        const state = await Gamedig.query({ type: 'cs16', host: SERVER_IP, port: SERVER_PORT, maxAttempts: 2 });
        const gtRank_COM = await getGameTrackerRank_COM(SERVER_IP, SERVER_PORT);
        const gtRank_RS = await getGameTrackerRank_RS(SERVER_IP, SERVER_PORT);
        
        // تجهيز رابط الاتصال
        const connectUrl = `steam://connect/${SERVER_IP}:${SERVER_PORT}`;
        
        // تجهيز قائمة اللاعبين
        const playerListFormatted = formatPlayerList(state.players);

        return new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`🔴 ${state.name}`) // اسم السيرفر في العنوان
            .setURL(connectUrl) // جعل العنوان قابلاً للضغط (على الكمبيوتر)
            .setDescription(`**[ اضغط هنا للدخول للسيرفر 🎮](${connectUrl})**\nConnect: \`${SERVER_IP}:${SERVER_PORT}\``)
            .addFields(
                // الصف الأول: الخريطة والبنق
                { name: '🗺️ Map', value: `**${state.map}**`, inline: true },
                { name: '📶 Ping', value: `\`${state.ping}ms\``, inline: true },
                { name: '\u200B', value: '\u200B', inline: true }, // فاصل
                
                // الصف الثاني: الترتيب (Top Server)
                { name: '🏆 Server Rank', value: `🇺🇸 GT.com: **${gtRank_COM}**\n🇷🇸 GT.rs: **${gtRank_RS}**`, inline: false },
                
                // الصف الثالث: اللاعبين
                { name: `👥 Players Online (${state.players.length}/${state.maxplayers})`, value: playerListFormatted, inline: false }
            )
            .setImage(`https://image.gametracker.com/images/maps/160x120/cs/${state.map}.jpg`) // صورة الخريطة (اختياري، يمكنك حذف هذا السطر)
            .setFooter({ text: `Last Updated: ${new Date().toLocaleTimeString('en-GB')} | Powered by GlaD` })
            .setTimestamp();

    } catch (error) {
        console.error('Gamedig Error:', error.message);
        return new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`⚠️ Server Offline`)
            .setDescription(`**IP:** ${SERVER_IP}:${SERVER_PORT}\nServer is currently offline or unreachable.`)
            .setFooter({ text: `Check Time: ${new Date().toLocaleTimeString('en-GB')}` });
    }
}

// المتغير لتخزين رسالة الويب هوك
let activeMessageId = null;

async function startMonitor() {
    console.log('🔄 Starting Webhook Monitor...');
    
    try {
        const initialEmbed = new EmbedBuilder().setDescription('🔄 **Fetching Server Info...**').setColor(0xFFFF00);
        const message = await webhookClient.send({
            username: 'CS 1.6 Monitor',
            avatarURL: '[https://i.imgur.com/3w8m6oN.png](https://i.imgur.com/3w8m6oN.png)', 
            embeds: [initialEmbed],
            fetchReply: true 
        });
        
        activeMessageId = message.id;
        console.log(`✅ Monitor Active. Msg ID: ${activeMessageId}`);

        updateLoop();
        setInterval(updateLoop, 60000); // تحديث كل دقيقة

    } catch (error) {
        console.error('❌ Failed to send initial webhook message:', error);
    }
}

async function updateLoop() {
    if (!activeMessageId) return;

    const embed = await createStatusEmbed();

    try {
        await webhookClient.editMessage(activeMessageId, {
            embeds: [embed]
        });
        console.log('Stats updated.');
    } catch (error) {
        console.error('❌ Update failed:', error.message);
        if (error.code === 10008) { 
            console.log('⚠️ Message deleted, restarting...');
            activeMessageId = null;
            startMonitor();
        }
    }
}

startMonitor();