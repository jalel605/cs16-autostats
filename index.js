const { WebhookClient, EmbedBuilder } = require('discord.js');
const Gamedig = require('gamedig');
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

// --- إعدادات السيرفر والويب هوك ---
// ضع رابط الويب هوك هنا أو في ملف .env
const WEBHOOK_URL = process.env.WEBHOOK_URL; 
// ضع أيبي وبورت السيرفر الذي تريد مراقبته هنا
const SERVER_IP = process.env.SERVER_IP || '127.0.0.1';
const SERVER_PORT = parseInt(process.env.SERVER_PORT) || 27015;

// --- Web Server Section (for Render Keep-Alive) ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('CS 1.6 Webhook Monitor is Online! 🟢');
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});
// --------------------------------------------------

// إنشاء عميل الويب هوك
const webhookClient = new WebhookClient({ url: WEBHOOK_URL });

// --- Function to get GameTracker.com Rank ---
async function getGameTrackerRank_COM(ip, port) {
    const url = `https://www.gametracker.com/server_info/${ip}:${port}/`;
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'CS16-Stats-Bot' }, timeout: 5000 });
        const $ = cheerio.load(response.data);
        let rankText = $('td:contains("Global Rank")').next('td').text().trim();

        if (rankText && rankText !== '-') {
            return rankText.split('(')[0].trim();
        } else {
            return "Not Listed";
        }
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

        if (rankText && rankText !== '-') {
            return rankText.split('(')[0].trim();
        } else {
            return "Not Listed";
        }
    } catch (error) {
        return "N/A";
    }
}

// دالة لجلب المعلومات وإنشاء الـ Embed
async function createStatusEmbed() {
    try {
        const state = await Gamedig.query({ type: 'cs16', host: SERVER_IP, port: SERVER_PORT, maxAttempts: 2 });
        const gtRank_COM = await getGameTrackerRank_COM(SERVER_IP, SERVER_PORT);
        const gtRank_RS = await getGameTrackerRank_RS(SERVER_IP, SERVER_PORT);

        return new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`📊 Monitor: ${state.name}`)
            .addFields(
                { name: '🗺️ Map', value: state.map, inline: true },
                { name: '👥 Players', value: `${state.players.length}/${state.maxplayers}`, inline: true },
                { name: '📶 Ping', value: `${state.ping}ms`, inline: true },
                { name: '🏆 GT.com', value: gtRank_COM, inline: true },
                { name: '🇷🇸 GT.rs', value: gtRank_RS, inline: true },
                { name: '🔗 Connect', value: `steam://connect/${SERVER_IP}:${SERVER_PORT}` }
            )
            .setFooter({ text: `Last Updated: ${new Date().toLocaleTimeString('en-GB')} | CS 1.6 Webhook` })
            .setTimestamp();

    } catch (error) {
        console.error('Gamedig Error:', error.message);
        return new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`⚠️ Server Offline or Unreachable`)
            .setDescription(`**IP:** ${SERVER_IP}:${SERVER_PORT}\nCould not query server info. Retrying...`)
            .setFooter({ text: `Last Attempt: ${new Date().toLocaleTimeString('en-GB')}` });
    }
}

// المتغير لتخزين رسالة الويب هوك التي سنقوم بتعديلها
let activeMessageId = null;

async function startMonitor() {
    console.log('🔄 Starting Webhook Monitor...');
    
    // 1. إرسال رسالة أولية
    try {
        const initialEmbed = new EmbedBuilder().setDescription('🔄 **Initializing Monitor...**').setColor(0xFFFF00);
        const message = await webhookClient.send({
            username: 'CS 1.6 Server Status',
            avatarURL: 'https://i.imgur.com/3w8m6oN.png', // يمكنك تغيير الصورة هنا
            embeds: [initialEmbed],
            fetchReply: true // مهم جداً للحصول على الأيدي
        });
        
        activeMessageId = message.id;
        console.log(`✅ Initial message sent with ID: ${activeMessageId}`);

        // 2. بدء التحديث الدوري (كل 60 ثانية)
        updateLoop();
        setInterval(updateLoop, 60000);

    } catch (error) {
        console.error('❌ Failed to send initial webhook message:', error);
    }
}

// دالة التحديث
async function updateLoop() {
    if (!activeMessageId) return;

    const embed = await createStatusEmbed();

    try {
        await webhookClient.editMessage(activeMessageId, {
            embeds: [embed]
        });
        console.log('Stats updated successfully.');
    } catch (error) {
        console.error('❌ Failed to edit webhook message:', error.message);
        // في حالة حذف الرسالة، نعيد الإرسال من جديد
        if (error.code === 10008) { // Unknown Message
            console.log('⚠️ Message deleted, restarting monitor...');
            activeMessageId = null;
            startMonitor();
        }
    }
}

// بدء التشغيل
startMonitor();