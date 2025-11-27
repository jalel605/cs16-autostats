const { WebhookClient, EmbedBuilder } = require('discord.js');
const Gamedig = require('gamedig');
const express = require('express');

// --- إعدادات السيرفر والويب هوك ---
const WEBHOOK_URL = process.env.WEBHOOK_URL; 
const SERVER_IP = process.env.SERVER_IP || '57.129.61.75';
const SERVER_PORT = parseInt(process.env.PORT) || 27015; // تم تصحيح هنا ليستخدم SERVER_PORT بدلاً من PORT

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

if (!WEBHOOK_URL) {
    console.error("❌ CRITICAL ERROR: WEBHOOK_URL is not defined in environment variables. Bot cannot connect to Discord.");
}

const webhookClient = new WebhookClient({ url: WEBHOOK_URL });

/**
 * دالة لتقسيم قائمة اللاعبين (الحقيقيين) وعرضها في ثلاثة أعمدة
 * @param {Array} players - قائمة اللاعبين الكاملة
 * @returns {Array} - مصفوفة من السلاسل النصية لثلاثة أعمدة للاعبين
 */
function formatPlayerColumns(players) {
    // تصفية اللاعبين الحقيقيين (Score > 0)
    const realPlayers = players.filter(p => p.score > 0); 
    if (realPlayers.length === 0) return ["😴 No real players online", "\u200B", "\u200B"];

    const cleanNames = realPlayers.map(p => p.name.replace(/`/g, '').trim());
    const count = cleanNames.length;
    const cols = 3;
    const chunkSize = Math.ceil(count / cols);

    const columns = [];
    for (let i = 0; i < cols; i++) {
        const start = i * chunkSize;
        const end = start + chunkSize;
        const chunk = cleanNames.slice(start, end);
        // نستخدم ``` لتنسيق الأسماء بشكل عمودي وواضح
        columns.push(chunk.length > 0 ? `\`\`\`\n${chunk.join('\n')}\n\`\`\`` : '\u200B');
    }
    return columns;
}

/**
 * دالة لتقسيم قائمة البوتات وعرضها في ثلاثة أعمدة
 * @param {Array} players - قائمة اللاعبين الكاملة
 * @returns {Array} - مصفوفة من السلاسل النصية لثلاثة أعمدة للبوتات
 */
function formatBotList(players) {
    // تصفية البوتات (Score === 0)
    const bots = players.filter(p => p.score === 0);
    if (bots.length === 0) return ["\u200B", "\u200B", "\u200B"];

    const cleanNames = bots.map(p => p.name.replace(/`/g, '').trim());
    const count = cleanNames.length;
    const cols = 3;
    const chunkSize = Math.ceil(count / cols);

    const columns = [];
    for (let i = 0; i < cols; i++) {
        const start = i * chunkSize;
        const end = start + chunkSize;
        const chunk = cleanNames.slice(start, end);
        // نستخدم ``` لتنسيق الأسماء بشكل عمودي وواضح
        columns.push(chunk.length > 0 ? `\`\`\`\n${chunk.join('\n')}\n\`\`\`` : '\u200B');
    }
    return columns;
}

// دالة لجلب المعلومات وإنشاء الـ Embed
async function createStatusEmbed() {
    try {
        // تم التعديل: زيادة المهلة الزمنية لضمان الاتصال
        const state = await Gamedig.query({ 
            type: 'cs16', 
            host: SERVER_IP, 
            port: SERVER_PORT, 
            maxAttempts: 3, 
            timeout: 5000 
        });
        
        const connectUrl = `steam://connect/${SERVER_IP}:${SERVER_PORT}`;
        const realPlayersArray = state.players.filter(p => p.score > 0);
        const totalPlayers = realPlayersArray.length; // حساب اللاعبين الحقيقيين فقط
        const totalBots = state.players.filter(p => p.score === 0).length;   // حساب البوتات
        const maxPlayers = state.maxplayers;
        const playersPercentage = maxPlayers > 0 ? Math.round((totalPlayers / maxPlayers) * 100) : 0;
        
        // تقسيم قائمة اللاعبين إلى أعمدة
        const [playerCol1, playerCol2, playerCol3] = formatPlayerColumns(state.players);
        // تقسيم قائمة البوتات إلى أعمدة
        const [botCol1, botCol2, botCol3] = formatBotList(state.players);

        // إنشاء الـ Embed
        const embed = new EmbedBuilder()
            .setColor(0x00FF00) 
            // جعل العنوان ديناميكياً باستخدام اسم السيرفر الفعلي والتفاصيل المتاحة
            .setTitle(`🟢 ${state.name}`) 
            .setDescription(
                `Connect: **steam://connect/${SERVER_IP}:${SERVER_PORT}**\n` 
            )
            .addFields(
                // الصف الأول: Status / Address / Map (تم استبدال Country بالـ Map)
                { name: 'Status', value: `🟢 **Online**`, inline: true },
                { name: 'Address:Port', value: `\`${SERVER_IP}:${SERVER_PORT}\``, inline: true },
                { name: 'Current Map', value: `**${state.map}**`, inline: true },
                
                // الصف الثاني: Game / Ping / Players Count
                { name: 'Game', value: `Counter-Strike 1.6 (${state.version || '2003'})`, inline: true },
                { name: 'Ping', value: `\`${state.ping}ms\``, inline: true },
                { name: 'Players', value: `**${totalPlayers}**/${maxPlayers} (**${playersPercentage}%**)`, inline: true },

                // فاصل وتنظيم لقائمة اللاعبين الحقيقيين
                { name: '\u200B', value: `__**Player List (${totalPlayers})**__`, inline: false },

                // الصف الثالث: قائمة اللاعبين في ثلاثة أعمدة
                { name: `\u200B`, value: playerCol1, inline: true },
                { name: `\u200B`, value: playerCol2, inline: true },
                { name: `\u200B`, value: playerCol3, inline: true },

                // فاصل وتنظيم لقائمة البوتات
                { name: '\u200B', value: `__**Bot List (${totalBots})**__`, inline: false },

                // الصف الرابع: قائمة البوتات في ثلاثة أعمدة
                { name: `\u200B`, value: botCol1, inline: true }, 
                { name: `\u200B`, value: botCol2, inline: true }, 
                { name: `\u200B`, value: botCol3, inline: true }
            )
            // إضافة "Powered by GlaD" إلى التذييل
            .setFooter({ text: `Powered by GlaD | Game Server Monitor | Last update: ${new Date().toLocaleTimeString('en-GB', { hour12: false })}` })
            .setTimestamp(); 

        return embed;

    } catch (error) {
        // في حال فشل الاتصال، عرض حالة Server Offline
        console.error('Gamedig Error (Server Offline):', error.message);
        return new EmbedBuilder()
            .setColor(0xFF0000) 
            .setTitle(`⚠️ Server Status: Server Offline`) 
            .setDescription(`**IP:** ${SERVER_IP}:${SERVER_PORT}\nServer is currently offline or unreachable.`)
            .setFooter({ text: `Check Time: ${new Date().toLocaleTimeString('en-GB', { hour12: false })}` });
    }
}

// المتغير لتخزين رسالة الويب هوك
let activeMessageId = null;

async function startMonitor() {
    console.log('🔄 Starting Webhook Monitor...');
    
    if (!WEBHOOK_URL) {
        console.log('🔴 Cannot start Discord functions due to missing WEBHOOK_URL.');
        return; 
    }

    try {
        const initialEmbed = new EmbedBuilder().setDescription('🔄 **Fetching Server Info...**').setColor(0xFFFF00);
        const message = await webhookClient.send({
            username: 'Game Server Monitor APP', 
            embeds: [initialEmbed],
            fetchReply: true 
        });
        
        activeMessageId = message.id;
        console.log(`✅ Monitor Active. Msg ID: ${activeMessageId}`);

        updateLoop();
        // التحديث كل دقيقة (60000 مللي ثانية)
        setInterval(updateLoop, 60000); 

    } catch (error) {
        console.error('❌ Failed to send initial webhook message. Check URL and Webhook permissions:', error.message);
    }
}

async function updateLoop() {
    if (!activeMessageId || !WEBHOOK_URL) return;

    const embed = await createStatusEmbed();

    try {
        // يتم تعديل الرسالة القديمة بدلاً من إرسال رسالة جديدة
        await webhookClient.editMessage(activeMessageId, {
            username: 'Game Server Monitor APP', 
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
