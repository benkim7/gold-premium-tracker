// /api/kis-goldprice.js

export default async function handler(req, res) {
  try {
    const { KIS_APP_KEY, KIS_APP_SECRET, KIS_GOLD_PDNO, KIS_MARKET_DIV, KIS_TR_ID } = process.env;
    if (!KIS_APP_KEY || !KIS_APP_SECRET)
      return res.status(400).json({ error: "환경변수 누락: KIS_APP_KEY / KIS_APP_SECRET 미설정" });

    // 1️⃣ 액세스 토큰 요청
    const tokenResp = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
      }),
    });

    let tokenJson;
    try {
      tokenJson = await tokenResp.json();
    } catch (e) {
      const text = await tokenResp.text();
      throw new Error("토큰 응답 JSON 파싱 실패: " + text);
    }

    if (!tokenJson?.access_token)
      throw new Error("토큰 발급 실패: " + JSON.stringify(tokenJson));

    const token = tokenJson.access_token;

    // 2️⃣ 금현물 시세 요청
    const kisUrl = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price";
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: KIS_MARKET_DIV || "J",
      FID_INPUT_ISCD: KIS_GOLD_PDNO || "KR7064580005", // 금현물
    });

    const kisResp = await fetch(`${kisUrl}?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
        tr_id: KIS_TR_ID || "FHKST01010100",
      },
    });

    let kisJson;
    try {
      kisJson = await kisResp.json();
    } catch {
      const text = await kisResp.text();
      return res.status(500).json({ error: "KIS 응답 JSON 파싱 실패", detail: text });
    }

    // 3️⃣ 정상 처리
    const priceKRWPerGram = Number(kisJson.output?.stck_prpr || 0);
    const priceKRWPerOz = priceKRWPerGram * 31.1035;

    if (priceKRWPerGram === 0)
      return res.status(200).json({
        ok: true,
        msg: "금 시세 0원 — 휴장 혹은 데이터 없음",
        priceKRWPerGram,
        priceKRWPerOz,
      });

    res.status(200).json({
      ok: true,
      pdno: KIS_GOLD_PDNO || "KR7064580005",
      priceKRWPerGram,
      priceKRWPerOz,
      raw: kisJson,
    });
  } catch (err) {
    console.error("KIS 프록시 에러:", err);
    res.status(500).json({ error: err.message || "서버 에러" });
  }
}
