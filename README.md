# 🛒 적정가 판독기

공공데이터(도매 경락가·소매가)와 비교해서 **지금 사려는 농·축·수산물 가격이 적정한지** 알려주는 스마트폰용 웹앱(PWA)입니다.
품목을 고르고 판매가·수량(kg/g/근/관/개…)·구매처를 넣으면 `매우 저렴 / 저렴 / 적정 / 조금 비쌈 / 비쌈`으로 판정하고,
전일·1개월·1년 시세 변화와 최근 가격 추이를 보여줍니다.

## 구조
```
GitHub Actions(매시) ─ 공공데이터 API 호출(키는 Secrets) ─▶ docs/data/*.json 커밋
                                                         │
GitHub Pages(docs/) ◀───────────── 폰 브라우저(PWA)가 JSON 만 읽음 (키 노출·CORS 문제 없음)
```
- `scripts/fetch-data.mjs` : 공공데이터포털 도·소매가(최근일자) + (선택) 전국 공영도매시장 실시간 경매 → `docs/data/latest.json`, `history.json`(최대 400일 누적)
- `docs/judge.js` : 판정 로직. 소매 평균가에 구매처 보정(전통시장 1.0, 마트 1.08, 온라인 1.12, 편의점 1.2, 산지직거래 0.9)을 곱해 적정구간(±) 산출
- `docs/ocr-parse.js` : 가격표 사진(OCR, Tesseract.js) 인식 결과에서 품목·가격·수량 추출
- `docs/` : 앱 본체(PWA, 오프라인 캐시)

## 시작하기
1. 이 저장소를 GitHub 에 push
2. **공공데이터포털(data.go.kr)** 에서 아래 API 를 *활용신청* (모두 같은 인증키 하나를 사용, 일반 인증키 Decoding/Encoding 어느 쪽이든 가능)
   - `한국농수산식품유통공사_최근일자 도,소매가격정보 조회` (필수)
   - `한국농수산식품유통공사_전국 공영도매시장 실시간 경매정보` (선택 — 오늘 경매 평균가 표시)
3. 저장소 *Settings → Secrets and variables → Actions → New repository secret* 에 이름 `DATA_GO_KR_KEY`, 값 = 인증키
4. *Actions → update-data → Run workflow* 로 첫 수집 (이후 매시 자동)
5. *Settings → Pages* → Source: `main` / 폴더 `/docs`
6. 폰에서 `https://<계정>.github.io/<저장소>/` 접속 → 공유/메뉴 → **홈 화면에 추가**

키 없이도 `docs/data` 의 **샘플 데이터**(실제 시세 아님)로 화면을 둘러볼 수 있습니다.

## 로컬 실행
```bash
npm run sample   # 샘플 데이터 생성
npm run serve    # http://localhost:8000
npm test
```

## 주의
- 두 API 모두 공공데이터포털 명세서(엑셀)를 확인해 작성했습니다: `recent/price`(`exmn_dd_prc`, `*_cnvs_prc` kg환산가 등), `katRealTime2/trades2`(`scsbd_prc` 등). 실제 키로 첫 실행 후 응답이 다르면 `scripts/lib.mjs` 만 고치면 됩니다. (엔드포인트는 `RECENT_URL`, `AUCTION_URL` 환경변수로 교체 가능)
- 소매 시세는 전국 평균이며 품질 등급·지역에 따라 다릅니다. 투자·거래 판단의 참고용입니다.
- 공산품·생필품은 한국소비자원 '참가격' 오픈API 를 같은 구조로 추가하면 확장할 수 있습니다.
