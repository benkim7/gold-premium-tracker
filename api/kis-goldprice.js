// /api/kis-goldprice.js
// Vercel Serverless Function
// 1) KIS에서 access_token 발급 → 2) 금현물 시세 조회 → 3) (g→oz) 단위 변환 후 클라이언트에 반환

export default async function handler(req, res) {
  try {
    // 환경변수 검사
    const appKey = process.env.KIS_APP_KEY;
    const appSecret = process.env.KIS_APP_SECRET;
    const pdno = process.env.KIS_GOLD_PDNO || req.query.pdno; // 금현물 종목 번호(상품번호)
    const marketDiv = process.env.KIS_MARKET_DIV || "J";       // 시장 구분 (문서 기준 값 확인)
    const trId = process.env.KIS_TR_ID || "FHKST01010100";     // 시세조회 TR ID (문서 기준 확인)

    if (!appKey || !appSecret) {
      return res.status(500).json({ error: "KIS_APP_KEY / KIS_APP_SECRET 미설정" });
    }
    if (!pdno) {
      return res.status(400).json({ error: "금현물 종목번호(PDNO)가 필요합니다. env KIS_GOLD_PDNO 설정 또는 ?pdno= 로 전달" });
    }

    // 1) 토큰 발급
    const tokenResp = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: appKey,
        appsecret: appSecret
      })
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok || !tokenJson?.access_token) {
      return res.status(500).json({ error: "토큰 발급 실패", detail: tokenJson });
    }
    const accessToken = tokenJson.access_token;

    // 2) 금현물 시세 조회
    const kisUrl = `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/search-stock-info?FID_COND_MRKT_DIV_CODE=${encodeURIComponent(marketDiv)}&FID_INPUT_ISCD=${encodeURIComponent(pdno)}`;
    const quoteResp = await fetch(kisUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "authorization": `Bearer ${accessToken}`,
        "appkey": appKey,
        "appsecret": appSecret,
        "tr_id": trId
      }
    });
    const quoteJson = await quoteResp.json();
    if (!quoteResp.ok) {
      return res.status(500).json({ error: "금현물 시세 조회 실패", detail: quoteJson });
    }

    // 3) 가격 필드 파싱 (문서 기준: output.stck_prpr = 현재가) — 실제 응답 키 확인 후 맞춰 수정 가능
    const rawPriceStr = quoteJson?.output?.stck_prpr;
    if (!rawPriceStr) {
      return res.status(500).json({ error: "응답에 stck_prpr 필드 없음", detail: quoteJson });
    }

    // KIS 응답은 문자열일 수 있으니 콤마 제거 후 숫자 변환
    const priceKRWPerGram = Number(String(rawPriceStr).replace(/,/g, ""));
    if (!Number.isFinite(priceKRWPerGram)) {
      return res.status(500).json({ error: "가격 파싱 실패", value: rawPriceStr });
    }

    // KRX 금현물은 보통 '그램(g) 단위' 호가 → oz로 변환
    const GRAMS_PER_TROY_OUNCE = 31.1034768;
    const priceKRWPerOz = priceKRWPerGram * GRAMS_PER_TROY_OUNCE;

    // 최종 반환
    return res.status(200).json({
      ok: true,
      pdno,
      priceKRWPerGram,
      priceKRWPerOz,
      raw: quoteJson
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
