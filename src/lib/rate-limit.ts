/**
 * Rate Limiter - 基于 IP 的内存速率限制
 * 
 * 三种预设:
 * - admin: 管理 API (30次/分钟)
 * - public: 公开 API (60次/分钟)  
 * - auth: 登录/认证 (5次/分钟, 防暴力破解)
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// 内存存储: key = ip + routeGroup
const store = new Map<string, RateLimitEntry>();

// 每5分钟清理过期条目
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetTime) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export type RateLimitPreset = 'admin' | 'public' | 'auth';

const PRESETS: Record<RateLimitPreset, { limit: number; windowMs: number }> = {
  admin: { limit: 30, windowMs: 60 * 1000 },    // 30次/分钟
  public: { limit: 60, windowMs: 60 * 1000 },   // 60次/分钟
  auth: { limit: 5, windowMs: 60 * 1000 },       // 5次/分钟 (防暴力破解)
};

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
}

/**
 * 检查请求是否在速率限制内
 */
export function checkRateLimit(
  request: Request,
  preset: RateLimitPreset
): RateLimitResult {
  const ip = getClientIp(request);
  const config = PRESETS[preset];
  const key = `${ip}:${preset}`;
  const now = Date.now();

  let entry = store.get(key);

  // 窗口已过期，重置
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    store.set(key, entry);
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetTime: entry.resetTime,
    };
  }

  // 增加计数
  entry.count++;

  const allowed = entry.count <= config.limit;
  return {
    allowed,
    limit: config.limit,
    remaining: Math.max(0, config.limit - entry.count),
    resetTime: entry.resetTime,
  };
}

/**
 * 生成 429 Too Many Requests 响应
 */
export function rateLimitResponse(resetTime: number): Response {
  const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
  return new Response(
    JSON.stringify({
      error: 'Too many requests, please try again later',
      success: false,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    }
  );
}

/**
 * 从请求中提取客户端 IP
 */
function getClientIp(request: Request): string {
  // 优先读取 x-forwarded-for (代理/CDN 场景)
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0].trim().substring(0, 45);
  }
  // 降级读取 x-real-ip
  const xri = request.headers.get('x-real-ip');
  if (xri) {
    return xri.trim().substring(0, 45);
  }
  return 'unknown';
}
