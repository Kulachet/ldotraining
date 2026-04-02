import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Google Auth Setup
  const getGoogleAuth = () => {
    // Try multiple common environment variable names for flexibility
    let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 
                process.env.GOOGLE_SERVICE_ACCOUNT || 
                process.env.GOOGLE_SERVICE_ACCOUNT_ID;
    
    let key = process.env.GOOGLE_PRIVATE_KEY || 
              process.env.GOOGLE_PRIVATE_KEY_ID || 
              process.env.GOOGLE_PRIVATE_KEY_STRING;

    if (!key) {
      console.error('Google Private Key is missing');
      return null;
    }

    // Robust key parsing
    try {
      // Aggressive cleaning: remove invisible characters and trim
      key = key.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

      // ULTIMATE FAIL-SAFE: If the user pasted the entire JSON file content
      if (key.startsWith('{') && key.endsWith('}')) {
        try {
          const json = JSON.parse(key);
          if (json.private_key) key = json.private_key.trim();
          if (json.client_email) email = json.client_email.trim();
          console.log('Detected full JSON service account file. Extracted credentials.');
        } catch (e) {
          // Not valid JSON, continue with normal parsing
        }
      }
      
      // Handle case where user might have pasted the entire JSON line: "private_key": "..."
      if (key.includes('"private_key":')) {
        const match = key.match(/"private_key":\s*"([^"]+)"/);
        if (match) {
          key = match[1];
        }
      }

      // Remove wrapping quotes (single or double) if present
      key = key.replace(/^["']|["']$/g, '').trim();
      
      // Handle literal \n strings (very common when copying from JSON)
      key = key.replace(/\\n/g, '\n');

      if (!email) {
        console.error('Google Service Account Email is missing');
        return null;
      }

      // Debug logging (safe part of the key)
      console.log(`Initializing Google Auth. Email: ${email}, Key Length: ${key.length}, Key Start: ${key.substring(0, 30)}...`);

      // Ensure it has the correct PEM headers (support PKCS#8 and PKCS#1)
      const hasHeader = key.includes('-----BEGIN PRIVATE KEY-----') || 
                        key.includes('-----BEGIN RSA PRIVATE KEY-----');
      
      if (!hasHeader) {
        // If it looks like just the base64 content, wrap it in PKCS#8 headers
        if (key.length > 500 && !key.includes(' ')) {
          key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
        } else {
          console.error('GOOGLE_PRIVATE_KEY is missing PEM headers and doesn\'t look like a raw base64 key.');
          return null;
        }
      }

      return new google.auth.JWT({
        email,
        key,
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/drive.readonly'
        ],
      });
    } catch (err: any) {
      console.error('Error initializing Google Auth JWT:', err.message);
      return null;
    }
  };

  const auth = getGoogleAuth();
  const calendar = auth ? google.calendar({ version: 'v3', auth }) : null;
  const drive = auth ? google.drive({ version: 'v3', auth }) : null;

  // API Routes
  app.post('/api/certificates/send', async (req, res) => {
    const { courseId, courseTitle, driveLink, attendees } = req.body;

    if (!drive) {
      return res.status(500).json({ error: 'Google Drive API not initialized. Please check GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY' });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ error: 'Email credentials not configured. Please set EMAIL_USER and EMAIL_PASS.' });
    }

    if (!attendees || !Array.isArray(attendees)) {
      return res.status(400).json({ error: 'Invalid attendees' });
    }

    // Extract Folder ID from Google Drive link
    const folderIdMatch = driveLink.match(/folders\/([a-zA-Z0-9-_]+)/);
    const folderId = folderIdMatch ? folderIdMatch[1] : null;

    if (!folderId) {
      return res.status(400).json({ error: 'Invalid Google Drive folder link' });
    }

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER.trim(),
          pass: process.env.EMAIL_PASS.replace(/\s/g, ''),
        },
      });

      // 1. List files in the folder to match by name
      console.log(`Starting to send certificates for ${attendees.length} attendees...`);
      const filesResponse = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1000,
      });

      const driveFiles = filesResponse.data.files || [];
      console.log(`Found ${driveFiles.length} files in Google Drive folder.`);
      
      const results = [];
      const errors = [];

      // Process in chunks to avoid rate limiting and timeouts
      const CHUNK_SIZE = 5;
      for (let i = 0; i < attendees.length; i += CHUNK_SIZE) {
        const chunk = attendees.slice(i, i + CHUNK_SIZE);
        console.log(`Processing chunk ${Math.floor(i/CHUNK_SIZE) + 1} of ${Math.ceil(attendees.length/CHUNK_SIZE)}...`);
        
        const chunkPromises = chunk.map(async (attendee: any) => {
          try {
            // Find the file that matches the expected fileName (e.g., "1.png")
            const matchedFile = driveFiles.find(f => f.name === attendee.fileName);

            if (!matchedFile) {
              console.warn(`File not found for attendee ${attendee.name}: ${attendee.fileName}`);
              errors.push({ name: attendee.name, error: 'File not found' });
              return;
            }

            // 2. Download the file content
            const fileContent = await drive.files.get({
              fileId: matchedFile.id!,
              alt: 'media',
            }, { responseType: 'arraybuffer' });

            // 3. Send email with attachment
            const mailOptions = {
              from: `"BU Academic Training" <${process.env.EMAIL_USER}>`,
              to: attendee.email,
              subject: `Certificate in ${courseTitle}`,
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                  <h2 style="color: #4F46E5;">ขอแสดงความยินดี!</h2>
                  <p>เรียน อาจารย์ ${attendee.name},</p>
                  <p>ขอขอบคุณที่ท่านได้เข้าร่วมการอบรมในหลักสูตร <strong>"${courseTitle}"</strong></p>
                  <p>ทางสำนักพัฒนาการเรียนรู้ ขอมอบใบประกาศนียบัตร (Certificate) เพื่อรับรองการเข้าร่วมอบรมของท่าน โดยท่านสามารถดาวน์โหลดไฟล์ที่แนบมาพร้อมกับอีเมลฉบับนี้</p>
                  <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4F46E5;">
                    <p style="margin: 0; font-size: 14px;"><strong>หลักสูตร:</strong> ${courseTitle}</p>
                  </div>
                  <p>หวังว่าท่านจะได้รับความรู้และประสบการณ์ที่เป็นประโยชน์จากการอบรมในครั้งนี้</p>
                  <p>ขอบคุณครับ<br/>สำนักพัฒนาการเรียนรู้ มหาวิทยาลัยกรุงเทพ</p>
                  <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                  <p style="font-size: 11px; color: #999; text-align: center;">* อีเมลนี้เป็นอีเมลอัตโนมัติ กรุณาอย่าตอบกลับ</p>
                </div>
              `,
              attachments: [
                {
                  filename: `Certificate_${courseTitle.replace(/\s+/g, '_')}.png`,
                  content: Buffer.from(fileContent.data as ArrayBuffer),
                }
              ]
            };

            const result = await transporter.sendMail(mailOptions);
            results.push(result);
          } catch (err: any) {
            console.error(`Error sending to ${attendee.name}:`, err.message);
            errors.push({ name: attendee.name, error: err.message });
          }
        });

        await Promise.all(chunkPromises);
        
        // Small delay between chunks to avoid rate limiting
        if (i + CHUNK_SIZE < attendees.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      res.json({ 
        success: true, 
        count: results.length, 
        errorCount: errors.length,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error: any) {
      console.error('Error sending certificates:', error);
      res.status(500).json({ error: error.message || 'Failed to send certificates' });
    }
  });

  app.post('/api/email/send-reminder', async (req, res) => {
    const { recipients, courseTitle, courseDate, startTime, endTime, courseRoom } = req.body;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ error: 'Email credentials not configured. Please set EMAIL_USER and EMAIL_PASS.' });
    }

    // Create transporter inside handler to ensure fresh env vars
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER.trim(),
        pass: process.env.EMAIL_PASS.replace(/\s/g, ''), // Auto-remove spaces from App Password
      },
    });

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients provided' });
    }

    try {
      const results = [];
      for (const recipient of recipients) {
        const mailOptions = {
          from: `"BU Academic Training" <${process.env.EMAIL_USER}>`,
          to: recipient.email,
          subject: `แจ้งเตือน: การอบรมหัวข้อ "${courseTitle}" ในวันพรุ่งนี้`,
          html: `
            <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
              <h2 style="color: #E63946;">แจ้งเตือนการเข้าอบรม</h2>
              <p>เรียน อาจารย์ ${recipient.name},</p>
              <p>ขอแจ้งเตือนว่าคุณมีกำหนดการเข้าอบรมในวันพรุ่งนี้:</p>
              <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 5px solid #E63946;">
                <p><strong>หัวข้อ:</strong> ${courseTitle}</p>
                <p><strong>วันที่:</strong> ${courseDate}</p>
                <p><strong>เวลา:</strong> ${startTime} - ${endTime} น.</p>
                <p><strong>สถานที่:</strong> ${courseRoom || '-'}</p>
              </div>
              <p>กรุณาเตรียมตัวให้พร้อมและเข้าอบรมตามเวลาที่กำหนด</p>
              <p>ขอบคุณครับ<br/>สำนักพัฒนาการเรียนรู้ มหาวิทยาลัยกรุงเทพ</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #888; font-style: italic;">* อีเมลนี้เป็นอีเมลจากระบบอัตโนมัติ ไม่ต้องตอบกลับ</p>
            </div>
          `,
        };

        const result = await transporter.sendMail(mailOptions);
        results.push(result);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      res.json({ success: true, count: results.length });
    } catch (error: any) {
      console.error('Error sending emails:', error);
      res.status(500).json({ error: error.message || 'Failed to send emails' });
    }
  });

  app.post('/api/calendar/create', async (req, res) => {
    const { instructorEmail, courseTitle, courseDate, startTime, endTime, courseRoom, instructorName } = req.body;

    if (!calendar) {
      return res.status(500).json({ error: 'Google Calendar API not initialized. Please check GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY' });
    }

    try {
      // courseDate is YYYY-MM-DD, startTime/endTime are HH:mm
      const startDateTime = new Date(`${courseDate}T${startTime}:00`);
      const endDateTime = new Date(`${courseDate}T${endTime}:00`);

      const event = {
        summary: `อบรม: ${courseTitle}`,
        location: courseRoom || '-',
        description: `การลงทะเบียนอบรมวิชาการสำหรับ ${instructorName}`,
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: 'Asia/Bangkok',
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: 'Asia/Bangkok',
        },
        attendees: [
          { email: instructorEmail },
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
      };

      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      
      const response = await calendar.events.insert({
        calendarId: calendarId,
        requestBody: event,
        sendUpdates: 'all', // This sends the email invitation
      });

      res.json({ success: true, eventId: response.data.id });
    } catch (error: any) {
      console.error('Error creating calendar event:', error);
      res.status(500).json({ error: error.message || 'Failed to create calendar event' });
    }
  });

  // Send Evaluation Email
  app.post('/api/email/send-evaluation', async (req, res) => {
    const { courseId, courseTitle, recipients } = req.body;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ error: 'Email credentials not configured. Please set EMAIL_USER and EMAIL_PASS.' });
    }

    if (!recipients || !Array.isArray(recipients)) {
      return res.status(400).json({ error: 'Invalid recipients' });
    }

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER.trim(),
          pass: process.env.EMAIL_PASS.replace(/\s/g, ''),
        },
      });

      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const evaluationUrl = `${appUrl}/?view=evaluation&courseId=${courseId}`;

      const results = [];
      for (const recipient of recipients) {
        const mailOptions = {
          from: `"BU Academic Training" <${process.env.EMAIL_USER}>`,
          to: recipient.email,
          subject: `แบบประเมินผลการอบรม: ${courseTitle}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #1a1a1a; margin-bottom: 10px;">แบบประเมินผลการอบรม</h1>
                <p style="color: #666; font-size: 16px;">ขอบคุณที่เข้าร่วมการอบรมกับเรา</p>
              </div>
              <div style="background-color: #f9f9f9; border-radius: 12px; padding: 30px; margin-bottom: 30px; border: 1px solid #eee;">
                <p style="font-size: 18px; font-weight: bold; margin-bottom: 20px; color: #1a1a1a;">หัวข้อ: ${courseTitle}</p>
                <p style="line-height: 1.6; margin-bottom: 25px;">
                  เพื่อให้การจัดการอบรมในครั้งต่อๆ ไปดียิ่งขึ้น ทางสำนักพัฒนาการเรียนรู้ ใคร่ขอความอนุเคราะห์จากท่านในการตอบแบบประเมินความพึงพอใจ 
                  โดยข้อมูลของท่านจะถูกเก็บเป็นความลับและไม่ระบุตัวตน
                </p>
                <div style="text-align: center;">
                  <a href="${evaluationUrl}" style="background-color: #1a1a1a; color: #ffffff; padding: 15px 35px; border-radius: 50px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    ทำแบบประเมินผล
                  </a>
                </div>
              </div>
              <p style="font-size: 12px; color: #999; text-align: center;">
                หากท่านไม่สามารถคลิกปุ่มได้ กรุณาคัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br/>
                <a href="${evaluationUrl}" style="color: #666;">${evaluationUrl}</a>
              </p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
              <p style="font-size: 12px; color: #999; text-align: center;">
                สำนักพัฒนาการเรียนรู้ มหาวิทยาลัยกรุงเทพ<br/>
                Learning Development Office, Bangkok University
              </p>
            </div>
          `,
        };
        const result = await transporter.sendMail(mailOptions);
        results.push(result);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      res.json({ success: true, count: results.length });
    } catch (error: any) {
      console.error('Error sending evaluation emails:', error);
      res.status(500).json({ error: error.message || 'Failed to send evaluation emails' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
