const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const CONFIG = {
  adminpayUrl: process.env.ADMINPAY_URL || 'https://adminpay1.net/dashboard',
  username: process.env.ADMINPAY_USERNAME || 'lionbet',
  password: process.env.ADMINPAY_PASSWORD || 'Chote73@',
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || 'qjwm przz iwuf rdrq',
  gmailAddress: process.env.GMAIL_ADDRESS || 'sundaramkr90@gmail.com',
  checkInterval: parseInt(process.env.CHECK_INTERVAL) || 5000,
  port: parseInt(process.env.PORT) || 3000
};

let lastPendingAmount = 0, browser = null, page = null, wss = null, alertsSent = 0, startTime = Date.now();
const app = express(), server = http.createServer(app);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: CONFIG.gmailAddress,
    pass: CONFIG.gmailAppPassword.replace(/\s/g, '')
  }
});

app.use(express.static('public'));

app.get('/', (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pending Request Monitor</title>
      <style>
        body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea, #764ba2); min-height: 100vh; display: flex; justify-content: center; align-items: center; margin: 0; }
        .container { background: white; padding: 40px; border-radius: 15px; max-width: 600px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        h1 { text-align: center; color: #333; margin: 0; }
        .status { background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0; font-weight: bold; }
        .amount { font-size: 48px; font-weight: bold; color: #667eea; text-align: center; margin: 30px 0; padding: 20px; background: #f5f7fa; border-radius: 10px; }
        .info { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
        .info-box { background: #f0f0f0; padding: 15px; border-radius: 8px; }
        .info-label { font-size: 12px; color: #666; }
        .info-value { font-size: 18px; font-weight: bold; color: #333; }
        .log { background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 15px; max-height: 300px; overflow-y: auto; font-size: 12px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📊 Monitor</h1>
        <div class="status">✅ ACTIVE</div>
        <div class="amount" id="amount">₹0</div>
        <div class="info">
          <div class="info-box">
            <div class="info-label">Alerts Sent</div>
            <div class="info-value" id="alerts">0</div>
          </div>
          <div class="info-box">
            <div class="info-label">Uptime</div>
            <div class="info-value" id="uptime">${uptime}s</div>
          </div>
        </div>
        <div class="log" id="log">Waiting for updates...</div>
      </div>
      <script>
        let alerts = ${alertsSent};
        let startTime = ${startTime};
        const ws = new WebSocket('ws://' + window.location.host);
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if(msg.type === 'update') {
            document.getElementById('amount').textContent = '₹' + msg.amount;
            if(msg.alerted) {
              alerts++;
              document.getElementById('alerts').textContent = alerts;
              playAlert();
            }
          }
          const log = document.getElementById('log');
          log.innerHTML = '<div>[' + new Date().toLocaleTimeString() + '] ' + msg.message + '</div>' + log.innerHTML.split('</div>').slice(0, 49).join('</div>');
        };
        function playAlert() {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          osc.frequency.value = 1000;
          osc.connect(ctx.destination);
          osc.start();
          setTimeout(() => osc.stop(), 200);
        }
        setInterval(() => {
          const uptime = Math.floor((Date.now() - startTime) / 1000);
          document.getElementById('uptime').textContent = uptime + 's';
        }, 1000);
      </script>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor((Date.now() - startTime) / 1000) });
});

wss = new WebSocket.Server({ server });

async function sendAlert(amount) {
  try {
    console.log(`[ALERT] Sending email for amount: ₹${amount}`);
    await transporter.sendMail({
      from: CONFIG.gmailAddress,
      to: CONFIG.gmailAddress,
      subject: '🚨 Pending Request - ₹' + amount,
      html: `
        <h2 style="color: #d9534f;">आपका ID पर pending है request जाकर काम करो</h2>
        <p><strong>Amount:</strong> ₹${amount}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString('en-IN')}</p>
        <a href="https://adminpay1.net/request?tab=wallet-request-tab-pane" style="background: #d9534f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Requests</a>
      `
    });
    alertsSent++;
    broadcastToClients({ type: 'update', amount: amount, alerted: true, message: '🔔 Alert sent! Amount: ₹' + amount });
    console.log(`[SUCCESS] Email sent for ₹${amount}`);
    return true;
  } catch (e) {
    console.error('[EMAIL_ERROR]', e.message);
    broadcastToClients({ type: 'update', amount: 0, alerted: false, message: '❌ Email Error: ' + e.message });
    return false;
  }
}

function broadcastToClients(msg) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  });
}

async function extractAmount(page) {
  console.log('[EXTRACT] Starting amount extraction...');
  
  const selectors = [
    () => page.$x("//*[contains(text(), 'User Pending Request')]").then(els => {
      if (els.length === 0) return null;
      return page.evaluate(el => {
        const parent = el.closest('div');
        if (!parent) return null;
        const text = parent.textContent;
        const match = text.match(/₹([\d.]+)/);
        return match ? parseFloat(match[1]) : null;
      }, els[0]);
    }),
    
    () => page.evaluate(() => {
      const divs = document.querySelectorAll('div');
      for (let div of divs) {
        if (div.textContent.includes('User Pending Request')) {
          const match = div.textContent.match(/₹([\d.]+)/);
          if (match) return parseFloat(match[1]);
        }
      }
      return null;
    }),
    
    () => page.evaluate(() => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes('User Pending Request')) {
          const parent = node.parentElement.closest('div');
          if (parent) {
            const match = parent.textContent.match(/₹([\d.]+)/);
            if (match) return parseFloat(match[1]);
          }
        }
      }
      return null;
    })
  ];

  for (let selector of selectors) {
    try {
      const amount = await selector();
      if (amount !== null && amount !== undefined) {
        console.log(`[EXTRACT] Found amount: ₹${amount}`);
        return amount;
      }
    } catch (e) {
      console.log(`[EXTRACT] Selector failed:`, e.message);
    }
  }

  console.log('[EXTRACT] Could not extract amount - returning 0');
  return 0;
}

async function monitor() {
  try {
    console.log(`\n[MONITOR] Check started at ${new Date().toLocaleTimeString()}`);
    
    if (!browser) {
      console.log('[BROWSER] Launching new browser...');
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    
    if (!page) {
      console.log('[PAGE] Creating new page...');
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
    }

    console.log('[NAV] Navigating to adminpay dashboard...');
    await page.goto(CONFIG.adminpayUrl, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    console.log('[NAV] Dashboard loaded');

    const amount = await extractAmount(page);
    console.log(`[RESULT] Current amount: ₹${amount}, Last: ₹${lastPendingAmount}`);

    if (amount > 0 && amount !== lastPendingAmount) {
      console.log(`[ACTION] New pending amount detected: ₹${amount}`);
      await sendAlert(amount);
      lastPendingAmount = amount;
    } else if (amount === 0 && lastPendingAmount !== 0) {
      console.log('[ACTION] Amount cleared');
      lastPendingAmount = 0;
      broadcastToClients({ type: 'update', amount: 0, alerted: false, message: '✅ Cleared! Amount back to ₹0' });
    } else if (amount === lastPendingAmount && amount > 0) {
      console.log(`[ACTION] Amount still pending: ₹${amount}`);
      broadcastToClients({ type: 'update', amount: amount, alerted: false, message: '⏱️ Still pending: ₹' + amount });
    }

    broadcastToClients({ type: 'update', amount: amount, alerted: false, message: '✅ Check OK - Amount: ₹' + amount });
  } catch (e) {
    console.error('[MONITOR_ERROR]', e.message);
    broadcastToClients({ type: 'update', amount: 0, alerted: false, message: '❌ Monitor Error: ' + e.message });
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.error('[BROWSER_CLOSE_ERROR]', closeErr.message);
      }
      browser = null;
      page = null;
    }
  }
}

async function start() {
  console.log('🚀 Monitor Started at', new Date().toISOString());
  console.log('📍 Config:', {
    url: CONFIG.adminpayUrl,
    username: CONFIG.username,
    checkInterval: CONFIG.checkInterval + 'ms',
    email: CONFIG.gmailAddress
  });
  
  await monitor();
  setInterval(monitor, CONFIG.checkInterval);
}

server.listen(CONFIG.port, () => {
  console.log(`✅ Server running on port ${CONFIG.port}`);
  console.log(`📊 Dashboard: http://localhost:${CONFIG.port}`);
  console.log(`❤️ Health check: http://localhost:${CONFIG.port}/health`);
  start();
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  if (browser) {
    try {
      await browser.close();
      console.log('✅ Browser closed');
    } catch (e) {
      console.error('Error closing browser:', e.message);
    }
  }
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED_REJECTION]', reason);
});
