import { NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

// POST /api/contact - Send contact form email
export async function POST(request: Request) {
  const rl = checkRateLimit(request, "public");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  const body = await request.json();
  const { name, email, subject, message } = body;

  if (!name || !email || !subject || !message) {
    return NextResponse.json({ success: false, error: 'All fields are required' }, { status: 400 });
  }

  // Store in database
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
    console.error('Contact message DB insert error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Send email via Resend
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (RESEND_API_KEY) {
    try {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'onboarding@resend.dev',
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

      const emailResult = await emailResponse.json();
      
      if (!emailResponse.ok) {
        console.error('Resend API error:', emailResponse.status, emailResult);
        // Email failed but message is stored in DB
        return NextResponse.json({ 
          success: true, 
          message: 'Message saved, but email delivery failed. We will review it in our system.',
          emailError: emailResult 
        });
      }

      console.log('Email sent successfully:', emailResult);
    } catch (err) {
      console.error('Resend API exception:', err);
    }
  } else {
    console.warn('RESEND_API_KEY not configured, email not sent');
  }

  return NextResponse.json({ success: true, message: 'Message sent successfully' });
}
