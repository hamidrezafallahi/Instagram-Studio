# ردیابی نیازها به پیاده‌سازی
| نیاز | مسیرهای اصلی | مرحله | آزمون |
|---|---|---|---|
| R01 برند و اطلاعات | config، packages/domain، apps/dashboard | M1 | A01,A07 |
| R02 برنامه منظم | workflows/editorial، apps/worker | M2 | A03,A14,A15 |
| R03 اینستاگرام و تریال | connectors/instagram، packages/media | M3,M5 | A05,A12,A22 |
| R04 لینکدین و شبکه ارتباط | connectors/linkedin، workflows | M5 | A12,A24 |
| R05 پاسخ پیام | agents، workflows، connectors | M6 | A06,A08,A28 |
| R06 ارتباط مالک | connectors/telegram، connectors/whatsapp | M4,M6 | A25 |
| R07 سایت و سئو | workflows/seo، connectors/cms | M4,M7 | A16 |
| R08 تبلیغات و بازنشر | connectors/ads، connectors/virgool، billing | M7 | A09,A10,A27 |
| R09 داشبورد و مکالمه | apps/dashboard، apps/api | M1–M8 | A02,A03,A15 |
| R10 هارنس/دو نوع اجرا | apps/mcp-server، infra | M6,M8 | A18,A26 |
| R11 امنیت و پایداری | security، data، orchestration، operations | M1–M8 | A04,A05,A17,A20 |
| R12 ابزارهای تولید/رایگان | media، ai، connectors/canva,zernio,postiz | M3,M7 | A22,A23,A24 |
| R13 چند برند پویا | config/industry-packs، data، policy | M1 | A01,A07,A19 |
| R14 شارژ و پرداخت | billing، dashboard، workflows | M2,M7 | A09,A10,A11 |

پیشوند مسیرهای connectors در جدول packages/connectors و billing برابر packages/billing است. جزئیات معیارها در tests/acceptance/README.md.
