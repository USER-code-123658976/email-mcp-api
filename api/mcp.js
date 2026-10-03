import { z } from 'zod';
import { createMcpHandler } from 'mcp-handler';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

// ==================== 工具1：发送邮件 ====================
async function sendMail({ sender_name, subject, content }) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.QQ_EMAIL,
      pass: process.env.QQ_AUTH_CODE,
    },
  });

  const info = await transporter.sendMail({
    from: `"${sender_name || 'AI Companion'}" <${process.env.QQ_EMAIL}>`,
    to: process.env.TO_EMAIL || process.env.QQ_EMAIL,
    subject: subject || '来自 AI 的邮件',
    text: content,
  });

  return {
    content: [
      {
        type: 'text',
        text: `邮件已成功发送，Message ID: ${info.messageId}`,
      },
    ],
  };
}

// ==================== 工具2：检查未读邮件 ====================
async function checkMail() {
  const client = new ImapFlow({
    host: 'imap.qq.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.QQ_EMAIL,
      pass: process.env.QQ_AUTH_CODE,
    },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  const messages = [];

  try {
    const searchResult = await client.search({ unseen: true });

    if (Array.isArray(searchResult) && searchResult.length > 0) {
      const targetSeq = searchResult.slice(-3); // 最多取最新3封
      const range = targetSeq.join(',');

      for await (const message of client.fetch(range, {
        envelope: true,
        source: true,
      })) {
        const parsed = await simpleParser(message.source);
        messages.push({
          subject: message.envelope.subject || '无主题',
          from: message.envelope.from?.[0]?.address || '未知发件人',
          date: message.envelope.date,
          content: (parsed.text || '（无文字正文）').trim().slice(0, 500),
        });
      }

      messages.reverse();
      await client.messageFlagsAdd(range, ['\\Seen']); // 标记为已读
    }
  } finally {
    lock.release();
  }

  await client.logout();

  if (messages.length === 0) {
    return {
      content: [{ type: 'text', text: '收件箱中没有未读邮件。' }],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(messages, null, 2),
      },
    ],
  };
}

// ==================== MCP 处理器 ====================
const handler = createMcpHandler(
  (server) => {
    // 注册工具1：send_mail
    server.registerTool(
      'send_mail',
      {
        title: '发送邮件',
        description: '给用户发送一封真实电子邮件',
        inputSchema: z.object({
          sender_name: z
            .string()
            .optional()
            .describe('发件人显示名称，默认为 AI Companion'),
          subject: z.string().optional().describe('邮件主题'),
          content: z.string().describe('邮件正文内容'),
        }),
      },
      async (args) => {
        try {
          return await sendMail(args);
        } catch (err) {
          return {
            content: [{ type: 'text', text: `发送失败: ${err.message}` }],
            isError: true,
          };
        }
      }
    );

    // 注册工具2：check_mail
    server.registerTool(
      'check_mail',
      {
        title: '检查邮件',
        description: '读取收件箱中最新未读邮件（最多3封）',
        inputSchema: z.object({}),
      },
      async () => {
        try {
          return await checkMail();
        } catch (err) {
          return {
            content: [{ type: 'text', text: `读取失败: ${err.message}` }],
            isError: true,
          };
        }
      }
    );
  },
  {},
  { basePath: '/api' }
);

// 导出 MCP 处理器，支持 GET/POST/DELETE 方法
export { handler as GET, handler as POST, handler as DELETE };
