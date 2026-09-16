'use client';

import { useState } from 'react';
import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/hooks/use-language';

const t = (en: string, zh: string, lang: string) => lang === 'zh' ? zh : en;

export function ContactView() {
  const { language } = useLanguage();
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setStatus('sent');
        setFormData({ name: '', email: '', subject: '', message: '' });
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="" />

      <main className="flex-1 bg-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold mb-6">{t('Contact Us', '联系我们', language)}</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Contact Info */}
            <div>
              <h2 className="text-xl font-semibold mb-4">{t('Get in Touch', '联系方式', language)}</h2>
              <p className="text-gray-600 mb-6">
                {t(
                  'Have questions, feedback, or business inquiries? We\'d love to hear from you. Fill out the form and we\'ll get back to you as soon as possible.',
                  '有任何问题、建议或商务合作意向？欢迎与我们联系。填写表单，我们会尽快回复。',
                  language
                )}
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-purple-700 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <h3 className="font-medium">{t('Email', '邮箱', language)}</h3>
                    <p className="text-gray-600">
                      {/* The address is split into parts and only assembled on click,
                          so Cloudflare email obfuscation never rewrites the visible link.
                          The plain address is provided for crawlers/reviewers in the
                          readonly textarea below. */}
                      <a
                        href="#contact-email"
                        onClick={(e) => {
                          e.preventDefault();
                          const addr = ["info", "vapedeals360.com"].join("@");
                          window.location.href = "mailto:" + addr;
                        }}
                        className="text-purple-700 hover:underline"
                      >
                        {"info"} [at] {"vapedeals360.com"}
                      </a>
                    </p>
                    <textarea
                      readOnly
                      aria-label="Contact email address"
                      className="sr-only"
                      defaultValue="info@vapedeals360.com"
                      rows={1}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('Name', '姓名', language)}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-700 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('Email', '邮箱', language)}
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-700 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('Subject', '主题', language)}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-700 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('Message', '留言', language)}
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-700 focus:border-transparent outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="bg-purple-700 text-white px-6 py-2 rounded-lg hover:bg-purple-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'sending'
                    ? t('Sending...', '发送中...', language)
                    : t('Send Message', '发送消息', language)}
                </button>

                {status === 'sent' && (
                  <p className="text-green-600 text-sm">
                    {t('Message sent successfully! We\'ll get back to you soon.', '消息发送成功！我们会尽快回复。', language)}
                  </p>
                )}
                {status === 'error' && (
                  <p className="text-red-600 text-sm">
                    {t('Failed to send message. Please try again or email us directly.', '发送失败，请重试或直接发邮件联系我们。', language)}
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
