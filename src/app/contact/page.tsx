'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/hooks/use-language';
import { useSiteSettings } from '@/components/site-settings-provider';
import { useSocialLinks } from '@/hooks/use-social-links';

export default function ContactPage() {
  const { language } = useLanguage();
  const { siteSettings } = useSiteSettings();
  const { socialLinks, getSocialIcon } = useSocialLinks();
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setSent(true);
        setFormData({ name: '', email: '', subject: '', message: '' });
      } else {
        setError(json.error || 'Failed to send message');
      }
    } catch {
      setError('Network error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="" />

      <main className="flex-1 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Contact Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <h1 className="text-3xl font-bold mb-2">
              {language === 'zh' ? '联系我们' : 'Contact Us'}
            </h1>
            <p className="text-gray-500 mb-8">
              {language === 'zh'
                ? '有任何问题或建议？请填写以下表单，我们会尽快回复您。'
                : 'Have a question or feedback? Fill out the form below and we\'ll get back to you as soon as possible.'}
            </p>

            {sent ? (
              <div className="text-center py-8">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                  <svg className="h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {language === 'zh' ? '消息已发送！' : 'Message Sent!'}
                </h3>
                <p className="text-sm text-gray-500">
                  {language === 'zh' ? '感谢您的来信，我们会尽快回复。' : 'Thank you for reaching out. We\'ll get back to you shortly.'}
                </p>
                <button
                  onClick={() => setSent(false)}
                  className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {language === 'zh' ? '发送另一条消息' : 'Send Another Message'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {language === 'zh' ? '姓名' : 'Name'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={language === 'zh' ? '您的姓名' : 'Your name'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {language === 'zh' ? '邮箱' : 'Email'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={language === 'zh' ? 'your@email.com' : 'your@email.com'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {language === 'zh' ? '主题' : 'Subject'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.subject}
                    onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={language === 'zh' ? '消息主题' : 'What is this about?'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {language === 'zh' ? '消息' : 'Message'} <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={formData.message}
                    onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    placeholder={language === 'zh' ? '请输入您的消息...' : 'Tell us what you need...'}
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-500">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending
                    ? (language === 'zh' ? '发送中...' : 'Sending...')
                    : (language === 'zh' ? '发送消息' : 'Send Message')}
                </button>
              </form>
            )}
          </div>

          {/* Back to All Deals */}
          <div className="mt-8 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              {language === 'zh' ? '返回首页' : 'Back to All Deals'}
            </Link>
          </div>
        </div>
      </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#0a0a0e] border-t border-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="hidden sm:block">
              <h4 className="text-sm font-semibold text-gray-300 mb-4">Navigation</h4>
              <div className="flex flex-col gap-2">
                <Link href="/" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Vape Deals</Link>
                <Link href="/best-vapes" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Best Vapes</Link>
                <Link href="/news" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">News</Link>
              </div>
            </div>
            <div className="hidden sm:block">
              <h4 className="text-sm font-semibold text-gray-300 mb-4">About</h4>
              <div className="flex flex-col gap-2">
                <Link href="/about" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">About Us</Link>
                <Link href="/contact" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Contact Us</Link>
                <Link href="/privacy" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Privacy Policy</Link>
                <Link href="/disclaimer" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Disclaimer</Link>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                {siteSettings?.logo_url ? (
                  <img
                    src={siteSettings.logo_url.startsWith('http') ? siteSettings.logo_url : `/api/image?key=${encodeURIComponent(siteSettings.logo_url)}`}
                    alt={siteSettings.site_name}
                    className="h-7 w-7 rounded-md object-contain"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-700 text-white font-bold text-sm">
                    {siteSettings?.site_name ? siteSettings.site_name.charAt(0) : '\u00A0'}
                  </div>
                )}
                <span className="text-sm font-semibold text-gray-300">{siteSettings?.site_name || '\u00A0'}</span>
              </div>
              <a href="mailto:info@vapedeals360.com" className="text-sm text-gray-500 hover:text-purple-400 transition-colors block mb-4">Email: info@vapedeals360.com</a>
              {socialLinks.length > 0 && (
                <div className="flex items-center gap-3">
                  {socialLinks.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-300 transition-colors"
                      title={link.platform}
                    >
                      {getSocialIcon(link.platform)}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 py-6 text-center text-xs text-gray-500">
          ©Vapedeals360.com All Rights Reserved.
        </div>
      </footer>
    </div>
  );
}
