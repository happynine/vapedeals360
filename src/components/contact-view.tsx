'use client';

import { useState } from 'react';
import Image from 'next/image';
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

  const inputClass =
    'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-gray-900 placeholder-gray-400 ' +
    'focus:ring-2 focus:ring-purple-700/30 focus:border-purple-700 outline-none transition-colors';

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="" />

      <main className="flex-1 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
          <h1 className="text-4xl font-bold text-gray-900 mb-12">{t('Contact Us', '联系我们', language)}</h1>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            {/* Left: info + illustration */}
            <div>
              <p className="text-lg text-gray-700 leading-relaxed mb-8 max-w-xl">
                {t(
                  'Have questions, feedback, or business inquiries? We\'d love to hear from you. Fill out the form and we\'ll get back to you as soon as possible.',
                  '有任何问题、建议或商务合作意向？欢迎与我们联系。填写表单，我们会尽快回复。',
                  language
                )}
              </p>

              <div className="flex items-center gap-3 mb-8">
                <span className="text-lg font-semibold text-gray-900">{t('Email', '邮箱', language)}</span>
                {/* The address is split into parts and only assembled on click,
                    so Cloudflare email obfuscation never rewrites the visible link.
                    The plain address is provided for crawlers/reviewers in the
                    readonly textarea below. */}
                <a
                  href="#contact-email"
                  onClick={(e) => {
                    e.preventDefault();
                    const addr = ['info', 'vapedeals360.com'].join('@');
                    window.location.href = 'mailto:' + addr;
                  }}
                  className="text-lg text-gray-900 hover:underline"
                >
                  info@vapedeals360.com
                </a>
                <textarea
                  readOnly
                  aria-label="Contact email address"
                  className="sr-only"
                  defaultValue="info@vapedeals360.com"
                  rows={1}
                />
              </div>

              <div className="relative w-full aspect-[16/9] overflow-hidden rounded-2xl">
                <Image
                  src="/images/contact-cover.jpg"
                  alt={t('Contact VapeDeals360', '联系 VapeDeals360', language)}
                  fill
                  sizes="(max-width: 1024px) 100vw, 560px"
                  className="object-cover"
                  priority
                />
              </div>
            </div>

            {/* Right: form */}
            <div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-base text-gray-700 mb-1.5">
                    {t('Name', '姓名', language)}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-base text-gray-700 mb-1.5">
                    {t('Email', '邮箱', language)}
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-base text-gray-700 mb-1.5">
                    {t('Subject', '主题', language)}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-base text-gray-700 mb-1.5">
                    {t('Message', '留言', language)}
                  </label>
                  <textarea
                    required
                    rows={6}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className={`${inputClass} resize-none`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="bg-purple-700 text-white px-8 py-3 rounded-lg text-base font-medium hover:bg-purple-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
