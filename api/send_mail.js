const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let body = req.body || req.query || {};

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  const {
    subject,
    content,
    sender,
    senderName,
    sender_name,
    sendername,
    sendemame
  } = body;

  if (!content) {
    return res.status(400).json({ error: '缺少 content 参数' });
  }

  const displayName =
    sender || senderName || sender_name || sendername || sendemame || 'AI Companion';

  const mailSubject = subject || '来自 AI 的邮件';

  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.QQ_EMAIL,
      pass: process.env.QQ_AUTH_CODE
    }
  });

  try {
    const info = await transporter.sendMail({
      from: `"${displayName}" <${process.env.QQ_EMAIL}>`,
      to: process.env.TO_EMAIL || process.env.QQ_EMAIL,
      subject: mailSubject,
      text: content
    });

    return res.status(200).json({
      success: true,
      messageId: info.messageId
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
