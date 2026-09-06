const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const CONFIG = {adminpayUrl:'https://adminpay1.net/dashboard',username:'lionbet',password:'Chote73@',gmailAppPassword:'qjwm przz iwuf rdrq',gmailAddress:'sundaramkr90@gmail.com',checkInterval:5000,port:3000};

let lastPendingAmount=0,browser=null,page=null,wss=null;
const app=express(),server=http.createServer(app);
const transporter=nodemailer.createTransport({service:'gmail',auth:{user:CONFIG.gmailAddress,pass:CONFIG.gmailAppPassword.replace(/\s/g,'')}});

app.use(express.static('public'));
app.get('/',(req,res)=>{res.send('<!DOCTYPE html><html><head><title>Monitor</title><style>body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center}.container{background:white;padding:40px;border-radius:15px;max-width:600px;box-shadow:0 20px 60px rgba(0,0,0,0.3)}.status{background:#d4edda;padding:15px;border-radius:8px;text-align:center;margin:20px 0;color:#155724}.amount{font-size:48px;font-weight:bold;color:#667eea;text-align:center;margin:30px 0;padding:20px;background:#f5f7fa;border-radius:10px}</style></head><body><div class="container"><h1>⚠️ Monitor</h1><div class="status">✓ ACTIVE</div><div class="amount">₹0</div></div></body></html>');});

app.get('/health',(req,res)=>{res.json({status:'ok'});});
wss=new WebSocket.Server({server});

async function sendAlert(amount){try{await transporter.sendMail({from:CONFIG.gmailAddress,to:CONFIG.gmailAddress,subject:'🚨 Pending - ₹'+amount,html:`<h2>आपका ID पर pending है request जाकर काम करो</h2><p>Amount: ₹${amount}</p>`});return true;}catch(e){return false;}}

async function monitor(){try{if(!browser)browser=await puppeteer.launch({headless:'new',args:['--no-sandbox']});if(!page)page=await browser.newPage();await page.goto(CONFIG.adminpayUrl,{waitUntil:'networkidle2',timeout:30000});const amount=await page.evaluate(()=>{const els=Array.from(document.querySelectorAll('*'));for(let el of els){if(el.textContent.includes('User Pending Request')){const p=el.closest('div');if(p){const m=p.textContent.match(/₹([\d.]+)/);if(m)return parseFloat(m[1]);}}}return 0;});console.log('Amount:',amount);if(amount>0&&amount!==lastPendingAmount){await sendAlert(amount);lastPendingAmount=amount;}}catch(e){console.error('Error:',e.message);if(browser){await browser.close();browser=null;page=null;}}}

async function start(){console.log('🚀 Monitor Started');await monitor();setInterval(monitor,CONFIG.checkInterval);}

server.listen(CONFIG.port,()=>{console.log(`✅ Server on ${CONFIG.port}`);start();});
process.on('SIGINT',async()=>{if(browser)await browser.close();process.exit(0);});
