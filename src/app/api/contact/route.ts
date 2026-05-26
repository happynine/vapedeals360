import { NextResponse } from 'next/server';

// POST /api/contact - Send contact form email
export async function POST(request: Request) {
  const body = await request.json();
  const { name, email, subject, message } = body;

  if (!name || !email || !subject || !message) {
    return NextResponse.json({ success: false, error: 'All fields are required' }, { status: 400 });
  }

  // Use Vercel's environment to determine if we can send email
  // For now, we store in a contact_messages table and also try to forward via mailto link approach
  const supabase = (await import('@/storage/database/supabase-client')).getSupabaseClient();

  const { error } = await supabase
    .from('contact_messages')
    .insert({
      name,
      email,
      subject,
      message,
      created_at: new Date().toISOString(),
    });

  if (error) {
    // If table doesn't exist, create it
    if (error.code === '42P01') {
      // Table doesn't exist, create it via SQL
      const createResult = await supabase.rpc('exec_sql', {
        sql: `CREATE TABLE IF NOT EXISTS contact_messages (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          subject VARCHAR(500) NOT NULL,
          message TEXT NOT NULL,
          is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );`
      });
      // Try insert again
      const { error: error2 } = await supabase
        .from('contact_messages')
        .insert({ name, email, subject, message, created_at: new Date().toISOString() });
      if (error2) {
        return NextResponse.json({ success: false, error: error2.message }, { status: 500 });
      }
    } else {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  // Forward to email via Resend if available, otherwise just store
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'VapeDeal Contact <noreply@vapedeals360.com>',
          to: ['funan9999@gmail.com'],
          subject: `[Contact] ${subject}`,
          html: `
            <h2>New Contact Message</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong></p>
            <p>${message.replace(/\n/g, '<br/>')}</p>
            <hr/>
            <p style="color:#999;font-size:12px;">Sent from VapeDeal Contact Form</p>
          `,
        }),
      });
    } catch {
      // Email send failed, but message is stored in DB
    }
  }

  return NextResponse.json({ success: true, message: 'Message sent successfully' });
}
