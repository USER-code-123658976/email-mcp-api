const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const client = new ImapFlow({
    host: 'imap.qq.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.QQ_EMAIL,
      pass: process.env.QQ_AUTH_CODE
    },
    logger: false
  });

  try {
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    const messages = [];

    try {
      const searchResult = await client.search({ unseen: true });

      if (Array.isArray(searchResult) && searchResult.length > 0) {
        // 取最新最多 3 封未读邮件
        const targetSeq = searchResult.slice(-3);

        // IMAP 序列号用逗号分隔，不是分号
        const range = targetSeq.join(',');

        for await (const message of client.fetch(range, {
          envelope: true,
          source: true
        })) {
          const parsed = await simpleParser(message.source);

          messages.push({
            subject: message.envelope.subject || '无主题',
            from: message.envelope.from?.[0]?.address || '未知发件人',
            date: message.envelope.date,
            content: (parsed.text || '（无文字正文）').trim().slice(0, 500)
          });
        }

        messages.reverse();

        // 读取后标记为已读
        await client.messageFlagsAdd(range, ['\\Seen']);
      }
    } finally {
      lock.release();
    }

    await client.logout();

    if (messages.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        messages: [],
        note: '没有未读邮件'
      });
    }

    return res.status(200).json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (err) {
    try {
      await client.logout();
    } catch (e) {}

    return res.status(500).json({ error: err.message });
  }
};
