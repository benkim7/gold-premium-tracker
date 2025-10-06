// api/kis-goldprice.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { KIS_APP_KEY, KIS_APP_SECRET, KIS_GOLD_PDNO, KIS_MARKET_DIV, KIS_TR_ID } = process.env;
    if (!KIS_APP_KEY || !KIS_APP_SECRET) {
      return res.status(400).json({ error: "KIS_APP_KEY / KIS_APP_SECRET 미설정" });
    }

    // ✅ Access Token 발급
    const tokenRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
      }),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson?.access_token) {
      return res.status(500).json({ error: "토큰 발급 실패", detail: tokenJson });
    }

    const accessToken = tokenJson.access_token;

    // ✅ 금현물 조회
    const url = `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price`;
    const query = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: KIS_MARKET_DIV || "J",
      FID_INPUT_ISCD: KIS_GOLD_PDNO || "KR7064580005",
    });

    const priceRes = await fetch(`${url}?${query.toString()}`, {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
        tr_id: KIS_TR_ID || "FHKST01010100",
      },
    });

    const priceJson = await priceRes.json();
    if (!priceRes.ok || !priceJson?.output) {
      return res.status(500).json({ error: "시세 조회 실패", detail: priceJson });
    }

    const stck_prpr = Number(priceJson.output.stck_prpr || 0);
    const priceKRWPerGram = stck_prpr;
    const priceKRWPerOz = priceKRWPerGram * 31.1035;

    return res.status(200).json({
      ok: true,
      pdno: KIS_GOLD_PDNO,
      priceKRWPerGram,
      priceKRWPerOz,
      raw: priceJson,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
