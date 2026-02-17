const testUrl = 'https://ev.phncdn.com/videos/202409/03/457308951/1080P_4000K_457308951.mp4?validfrom=1771075685&validto=1771082885&rate=50000k&burst=50000k&ip=154.40.35.4&ipa=1&hash=pHB1GS9GevWdS%2FEf2%2BYQYrCSpo4%3D';

async function test() {
  console.log('Testing direct fetch...');

  // 直接测试视频 URL
  const response = await fetch(testUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.pornhub.com/',
    }
  });

  console.log('Status:', response.status);
  console.log('Headers:', Object.fromEntries(response.headers.entries()));
}

test().catch(console.error);
