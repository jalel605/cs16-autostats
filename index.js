const { WebhookClient, EmbedBuilder } = require('discord.js');
const Gamedig = require('gamedig');
const express = require('express');

// --- إعدادات السيرفر والويب هوك ---
// يجب التأكد من ضبط هذه المتغيرات في بيئة التشغيل
const WEBHOOK_URL = process.env.WEBHOOK_URL; 
// تم التعديل: استخدام الـ IP الجديد الذي طلبه المستخدم
const SERVER_IP = process.env.SERVER_IP || '57.129.61.75';
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

// التحقق من وجود رابط الويب هوك عند بدء التشغيل
if (!WEBHOOK_URL) {
    console.error("❌ CRITICAL ERROR: WEBHOOK_URL is not defined in environment variables. Bot cannot connect to Discord.");
}

const webhookClient = new WebhookClient({ url: WEBHOOK_URL });

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
    
    // وضعناها داخل ``` لكي تظهر بشكل منظم وعمودي
    return `\`\`\`\n${listStr}\n\`\`\``;
}

// دالة لجلب المعلومات وإنشاء الـ Embed
async function createStatusEmbed() {
    try {
        // 1. الاتصال المباشر بالسيرفر لجلب الحالة وقائمة اللاعبين
        const state = await Gamedig.query({ type: 'cs16', host: SERVER_IP, port: SERVER_PORT, maxAttempts: 2 });
        
        // 2. تجهيز روابط GameTracker
        const connectUrl = `steam://connect/${SERVER_IP}:${SERVER_PORT}`;
        const gtComUrl = `https://www.gametracker.com/server_info/${SERVER_IP}:${SERVER_PORT}/`;
        const gtRsUrl = `https://www.gametracker.rs/server_info/${SERVER_IP}:${SERVER_PORT}/`;

        // روابط صور البانرات (تتحدث تلقائياً من مواقعها)
        const gtComBanner = `https://www.gametracker.com/server_info/${SERVER_IP}:${SERVER_PORT}/b_560_95_1.png`;
        const gtRsBanner = `https://www.gametracker.rs/server_info/${SERVER_IP}:${SERVER_PORT}/banner/`;

        // 3. جلب الترتيب والإحصائيات من GameTracker.rs (طلب المستخدم)
        let gtRank = 'N/A';
        let gtAvgPlayers = 'N/A';
        
        try {
            const response = await fetch(gtRsUrl);
            const html = await response.text();

            // Regex for World Rank: يبحث عن "World rank: " ثم يستخلص الرقم من أول span
            const rankMatch = html.match(/World rank:.*?<span[^>]*>\s*(\d+)/s);
            if (rankMatch && rankMatch[1]) {
                gtRank = `#${rankMatch[1]}`;
            }

            // Regex for Average Players (last 12h): يستخلص الرقم العشري
            const avgMatch = html.match(/Average number of players \(last 12h\):.*?<span[^>]*>([\d.]+)/s);
            if (avgMatch && avgMatch[1]) {
                gtAvgPlayers = avgMatch[1];
            }
        } catch (scrapeError) {
            console.error('GameTracker Scrape Error (Will use N/A for rank/avg):', scrapeError.message);
            // يستمر في العمل حتى لو فشل الجلب
        }
        
        // تجهيز قائمة اللاعبين
        const playerListFormatted = formatPlayerList(state.players);

        return new EmbedBuilder()
            // اللون الأخضر لحالة التشغيل
            .setColor(0x00FF00) 
            // عنوان واضح لحالة التشغيل
            .setTitle(`🟢 Server Status: ${state.name}`) 
            .setURL(connectUrl) // جعل العنوان قابلاً للضغط (على الكمبيوتر)
            // وضعنا البانرات داخل الوصف باستخدام الماركدون
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
                
                // تم التعديل: إضافة حقل الترتيب والإحصائيات المطلوبة
                { name: '🌐 Server Rank & Average', 
                  value: `World Rank: **${gtRank}**\nAvg. Players (12h): **${gtAvgPlayers}**`, 
                  inline: false },
                  
                // الصف التالي: اللاعبين (هنا يتم عرض القائمة العمودية)
                { name: `👥 Players Online (${state.players.length}/${state.maxplayers})`, value: playerListFormatted, inline: false }
            )
            .setFooter({ text: `Last Updated: ${new Date().toLocaleTimeString('en-GB')} | Powered by GlaD` })
            .setTimestamp();

    } catch (error) {
        console.error('Gamedig Error (Server Offline):', error.message);
        return new EmbedBuilder()
            // اللون الأحمر لحالة عدم التشغيل
            .setColor(0xFF0000) 
            // عنوان واضح لحالة عدم التشغيل
            .setTitle(`⚠️ Server Offline`) 
            .setDescription(`**IP:** ${SERVER_IP}:${SERVER_PORT}\nServer is currently offline or unreachable.`)
            .setFooter({ text: `Check Time: ${new Date().toLocaleTimeString('en-GB')}` });
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
            username: 'CS 1.6 Monitor',
            // تم إزالة avatarURL لطلب المستخدم. سيستخدم الـ Webhook الصورة الافتراضية.
            embeds: [initialEmbed],
            fetchReply: true 
        });
        
        activeMessageId = message.id;
        console.log(`✅ Monitor Active. Msg ID: ${activeMessageId}`);

        updateLoop();
        // التحديث كل دقيقة (60000 مللي ثانية) كما طلب المستخدم
        setInterval(updateLoop, 60000); 

    } catch (error) {
        console.error('❌ Failed to send initial webhook message. Check URL and Webhook permissions:', error.message);
    }
}

async function updateLoop() {
    if (!activeMessageId || !WEBHOOK_URL) return;

    const embed = await createStatusEmbed();

    try {
        // يتم تعديل الرسالة القديمة بدلاً من إرسال رسالة جديدة (طلب المستخدم)
        await webhookClient.editMessage(activeMessageId, {
            username: 'CS 1.6 Monitor', // أبقينا اسم المستخدم لضمان الثبات
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