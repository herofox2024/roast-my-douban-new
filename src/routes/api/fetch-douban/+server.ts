import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const API_BATCH_SIZE = 50;
const DEFAULT_MAX_ITEMS = 100;
const MAX_ALLOWED_ITEMS = 10000;
const DEFAULT_EXPORT_QUERY_LIMIT = 200;

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const POST: RequestHandler = async ({ request }: { request: Request }) => {
	const { userId, type, maxItems: maxItemsRaw, queryLimit: queryLimitRaw, shuffle } = await request.json();

	if (!userId || !type) {
		throw error(400, '缺少必要参数');
	}

  const requestedLimitRaw = queryLimitRaw ?? maxItemsRaw;
  const parsedMaxItems = Number(requestedLimitRaw);
  const maxItems = Number.isFinite(parsedMaxItems)
    ? Math.min(MAX_ALLOWED_ITEMS, Math.max(1, Math.floor(parsedMaxItems)))
    : DEFAULT_MAX_ITEMS;
  const shouldShuffle = typeof shuffle === 'boolean' ? shuffle : true;
  const queryLimit = shouldShuffle ? Math.max(maxItems, DEFAULT_EXPORT_QUERY_LIMIT) : maxItems;


    // Helper to fetch data from Rexxar API
    const fetchData = async (start: number, count: number) => {
        // API: https://m.douban.com/rexxar/api/v2/user/{userId}/interests
        // Params from user report: type=book&status=done&start=0&count=20&ck=ruZ3&for_mobile=1
      const url = `https://m.douban.com/rexxar/api/v2/user/${ userId }/interests?type=${ type }&status=done&count=${ count }&start=${ start }&for_mobile=1`;
        
        const headers = {
            'Referer': 'https://m.douban.com/mine/',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.31(0x18001f30) NetType/WIFI Language/zh_CN',
            // Note: No cookie needed for public profiles via this API often, 
            // but if we had one, we'd add it. Here we try without as requested.
        };

        const res = await fetch(url, { headers });
        if (!res.ok) {
            console.error(`Douban API Error: ${res.status} ${res.statusText}`);
            if (res.status === 404) throw error(404, '未找到用户或隐私设置阻止访问');
            if (res.status === 403) throw error(403, '豆瓣拒绝了请求 (403)，请稍后再试');
            // Return empty if failed to allow partial data? Or throw?
            // Throwing is safer to let user know.
            throw error(res.status, '从豆瓣获取数据失败');
        }
        return await res.json();
    };

	try {
    const rawInterests: any[] = [];
    let totalFromApi: number | null = null;
    for (let start = 0; start < queryLimit; start += API_BATCH_SIZE) {
      if (totalFromApi !== null && start >= totalFromApi) break;

      const page = await fetchData(start, API_BATCH_SIZE);
      const pageInterests = Array.isArray(page.interests) ? page.interests : [];
      if (typeof page.total === 'number' && Number.isFinite(page.total)) {
        totalFromApi = page.total;
      }
      if (pageInterests.length === 0) break;
      rawInterests.push(...pageInterests);
      if (pageInterests.length < API_BATCH_SIZE) break;
      if (rawInterests.length >= queryLimit) break;
      if (totalFromApi !== null && start + API_BATCH_SIZE >= totalFromApi) break;
    }

        // Map to cleaner format
    let items = rawInterests.map((item: any) => ({
            title: item.subject?.title || '未知',
            rating: item.rating?.value, // API returns object { value: 5, ... }
            tags: item.tags,
            comment: item.comment,
            create_time: item.create_time,
            year: item.subject?.year,
            cover_url: item.subject?.pic?.large || item.subject?.cover_url || ''
        }));

    // For roast mode (shuffle=true), only keep items with meaningful data for AI analysis.
    // For export mode (shuffle=false), keep all items so nothing is lost.
    if (shouldShuffle) {
      items = items.filter(item => {
        const hasRating = item.rating !== undefined && item.rating !== null;
        const hasComment = typeof item.comment === 'string' && item.comment.length > 0;
        const hasTags = Array.isArray(item.tags) && item.tags.length > 0;
        return hasRating || hasComment || hasTags;
      });
    }

    if (items.length > queryLimit) {
      items = items.slice(0, queryLimit);
    }

    if (shouldShuffle && items.length > maxItems) {
      items = shuffleInPlace(items).slice(0, maxItems);
    } else if (!shouldShuffle && items.length > maxItems) {
      items = items.slice(0, maxItems);
    }

    const result = {
            count: items.length,
            interests: items
    };



    return json(result);

	} catch (e: any) {
		console.error('Proxy Error:', e);
    const status = e.status || 500;
    const message = e.body?.message || e.message || '获取豆瓣数据失败';
    throw error(status, message);
	}
};

