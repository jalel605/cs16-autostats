const { WebhookClient, EmbedBuilder } = require('discord.js');
const Gamedig = require('gamedig');
const express = require('express');
// const axios = require('axios'); // لم نعد بحاجة لهذا
// const cheerio = require('cheerio'); // لم نعد بحاجة لهذا

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

// --- تم حذف دوال جلب الترتيب القديمة لأننا سنستخدم الصور مباشرة ---

// دالة تنسيق قائمة اللاعبين (ممتازة كما هي)
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
        
        // تجهيز روابط الاتصال والبانرات
        const connectUrl = `steam://connect/${SERVER_IP}:${SERVER_PORT}`;
        
        // روابط صفحات السيرفر
        const gtComUrl = `https://www.gametracker.com/server_info/${SERVER_IP}:${SERVER_PORT}/`;
        const gtRsUrl = `https://www.gametracker.rs/server_info/${SERVER_IP}:${SERVER_PORT}/`;

        // روابط صور البانرات (تتحدث تلقائياً من مواقعها)
        // استخدام نمط بانر عريض وواضح لـ .com
        const gtComBanner = `https://www.gametracker.com/server_info/${SERVER_IP}:${SERVER_PORT}/b_560_95_1.png`;
        // رابط البانر القياسي لـ .rs
        const gtRsBanner = `https://www.gametracker.rs/server_info/${SERVER_IP}:${SERVER_PORT}/banner/`;

        
        // تجهيز قائمة اللاعبين
        const playerListFormatted = formatPlayerList(state.players);

        return new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`🔴 ${state.name}`) // اسم السيرفر في العنوان
            .setURL(connectUrl) // جعل العنوان قابلاً للضغط (على الكمبيوتر)
            // هنا التعديل الرئيسي: وضعنا البانرات داخل الوصف باستخدام الماركدون
            .setDescription(
                `**[ اضغط هنا للدخول للسيرفر 🎮](${connectUrl})**\n` +
                `Connect: \`${SERVER_IP}:${SERVER_PORT}\`\n\n` +
                `**GAME SERVER RANKING**\n` +
                `[![GameTracker.com](${gtComBanner})](${gtComUrl})\n` + // صورة قابلة للضغط لـ .com
                `[![GameTracker.rs](${gtRsBanner})](${gtRsUrl})`         // صورة قابلة للضغط لـ .rs
            )
            .addFields(
                // الصف الأول: الخريطة والبنق
                { name: '🗺️ Map', value: `**${state.map}**`, inline: true },
                { name: '📶 Ping', value: `\`${state.ping}ms\``, inline: true },
                { name: '\u200B', value: '\u200B', inline: true }, // فاصل
                
                // تم حذف صف "Server Rank" النصي القديم
                
                // الصف التالي: اللاعبين
                { name: `👥 Players Online (${state.players.length}/${state.maxplayers})`, value: playerListFormatted, inline: false }
            )
            // .setImage(...) // قمت بإخفاء صورة الخريطة السفلية لكي لا يصبح المنظر مزدحماً مع البانرات الجديدة، يمكنك إعادتها إذا أردت
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
            avatarURL: '[https://i.imgur.com/3w8m6oN.png](https://i.imgur.com/3w8m6oN.png)', // تم تصحيح الرابط هنا كان يحتوي على أقواس زائدة
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