# CLAUDE.md — ORIGINAL (LEGACY / PROVENANCE / NOT CURRENT AUTHORITY)

> Preserved verbatim on 2026-08-11 as provenance of the pre-lean `CLAUDE.md` (1,866 lines).
> **This is NOT current authority.** Current operational instructions live in the repo-root lean `CLAUDE.md`.
> Current business/accounting/ledger authority lives in `docs/canonical/` + `docs/governance/`. Do not read this file for current rules.
> Retained under the Canonical Knowledge Gate — nothing was archived or deleted; the OneDrive original also remains in place.

---

# JJ PROPERTY 10 — מסמך הקשר מרכזי לסוכנים
## קרא קובץ זה ראשון לפני כל פעולה על המערכת

---

## 1. מה זה JJ PROPERTY 10
חברה קפריסאית לניהול נכסים. שותפים: **יוסי (50%) + ג'ייקוב (50%)**.  
כל הנכסים ב-JJ 50/50, חוץ מ-**Villa Mazotos**: אבי 50%, יוסי 25%, Jacob 25%.

---

## 1.5 Active Workstreams — הפרדת מסלולים

| Track | תיאור | סוכן | תחום אחריות |
|-------|--------|------|-------------|
| **Track A** | Platform Development | סוכן פיתוח | Next.js, PR, CI, UI, schema migrations |
| **Track B** | JHKA — Organizational Memory | סוכן JHKA | היסטוריה, ראיות, WhatsApp, Business Events, Decision Batches |
| **Track C** | Hostaway Knowledge Base (M1) | סוכן M1 | הבנת Hostaway, API, דוחות פיננסיים, Financial Knowledge Base |

> ⚠️ **כלל מחייב:** אסור לערבב בין workstreams אלא אם יוסי הורה במפורש. כל סוכן עובד בתוך ה-Track שלו בלבד. אם סוכן JHKA מגלה ממצא שרלוונטי ל-Track C — הוא מתעד אותו ומסמן "relevant to Track C", אבל לא חוקר אותו בעצמו.

---

## 2. Supabase — חיבור

| פריט | ערך |
|------|-----|
| Project ID | `vsiiprzjrstjcmjpwcrd` |
| URL | `https://vsiiprzjrstjcmjpwcrd.supabase.co` |
| Secret Key | 🔒 הוסר מהמסמך (9 יולי 2026). נמצא בקובץ `.env` מקומי / Supabase Vault. **אין להחזיר secrets לקובץ זה.** |
| Dashboard | https://supabase.com/dashboard/project/vsiiprzjrstjcmjpwcrd |

> 🔒 **אבטחה (Phase 0 — הושלם 9 יולי 2026):** כל הסקריפטים קוראים את המפתח מ-env var `SUPABASE_SECRET_KEY` (או קובץ `.env` ליד הסקריפט). המפתח קיים אך ורק ב-`.env`. **אסור להחזיר secrets לשום קובץ אחר.** המפתח נחשף בעבר במסמכים → נדרש Rotation ב-Dashboard (Settings → API) ועדכון `.env` אחריו. בנוסף נוקו: GitHub PAT מקבצי לוג (נדרש Revoke ב-GitHub), service_role JWT מ-`auth_dump/env_local.txt`.

> ⚠️ הסביבה חסומה לאינטרנט — לא ניתן להגיע לסופאבייס מהסנדבוקס. יש ליצור Python scripts שהמשתמש מריץ מקומית, או SQL לביצוע ב-SQL Editor.

---

## 3. טבלת transactions — סכמה

```sql
id             UUID (primary key, auto-generated)
date           DATE
property_id    TEXT (nullable)
property_name  TEXT  ← שם הנכס (לא "property" — חשוב!)
category       TEXT
subcategory    TEXT
description    TEXT
payer          TEXT
payee          TEXT
amount_eur     NUMERIC
client_charge  NUMERIC (nullable)
notes          TEXT (nullable)
k_note         TEXT (nullable)
review_status  TEXT (nullable, default 'active')  ← RC1 PREREQUISITE — see Section 14
created_at     TIMESTAMP
updated_at     TIMESTAMP
```

**review_status ערכים מותרים:**
`active` | `duplicate_candidate` | `confirmed_duplicate` | `ignored`

> ⚠️ כל חישוב של Client Report חייב לסנן רק שורות עם `review_status = 'active'` (או NULL).
> **אסור למחוק שורות היסטוריות** — גם שורות כפולות מקבלות סטטוס, לא נמחקות.

**סטטוס נוכחי (נאמת 22 יולי 2026, WA-002 Phase 2 CP-Q042 execution):** 2,161 שורות.

**review_status distribution (נאמת 22 יולי 2026, WA-002 Phase 2):**
| review_status | שורות |
|---|---|
| `active` | 2,138 |
| `confirmed_duplicate` | 23 |
| **Total** | **2,161** |

### Verified DB State — 2,161 שורות (נאמת 22 יולי 2026, WA-002 Phase 2 CP-Q042 execution):

> ⚠️ **Dual-Scope Baseline Rule (אושר 17 יולי 2026):** Track A מחזיק שני בסיסים מפורשים.
> - **Operational Baseline** = active rows only (`review_status = 'active' OR NULL`). זהו הבסיס הסמכותי לדיווח עסקי, סכומים פיננסיים, ואימות post-change.
> - **Audit Baseline** = כל השורות השמורות כולל confirmed_duplicate. לצורך שימור ראיות, שלמות ספירת שורות, ו-audit reconciliation בלבד. **אסור להציגו כמצב פיננסי תפעולי.**
>
> הערה היסטורית: הבסיס המקורי (2,127 שורות, 8 יולי 2026) רשם `Total client_charge = 118,395.14` ללא תיוג scope. SQL מאומת הוכיח שמספר זה כלל את כל השורות (כולל confirmed_duplicate). ה-client_charge של 12 שורות duplicate = €6,025.01. זו הייתה טעות תיוג במסמך, לא בעיית שלמות נתונים.

**Operational Baseline (active only):**
| בדיקה | ערך |
|-------|-----|
| Active rows | 2,138 |
| Active amount_eur | 12,632,072.23 |
| Active client_charge | 113,460.13 |

**Audit Baseline (all preserved rows):**
| בדיקה | ערך |
|-------|-----|
| Total preserved rows | 2,161 |
| Confirmed duplicates | 23 |
| All-rows client_charge | 120,555.14 |

### Historical baseline (jj_clean_v2.csv — 2,059 שורות — לא מייצג את ה-DB הנוכחי):
| בדיקה | ערך |
|-------|-----|
| Total rows | 2,059 |
| Total amount_eur | 12,280,207.75 |
| Total client_charge | 112,474.00 |
| Unique properties | 38 |
| Unique subcategories | 87 |
| Category: Renovation | 583 |
| Category: Airbnb | 438 |
| Category: Management | 357 |
| Category: JJ | 273 |
| Category: Sale | 158 |
| Category: Purchase | 130 |
| Category: Transfer | 119 |
| Category: General | 1 |

---

## 4. כללי עסק קריטיים

### ⚠️ חוזה ≠ תשלום
- `subcategory = "Purchase Contract"` = ערך עסקת רכישה בלבד. **אינו תנועת מזומן**.
- `subcategory = "Sale Contract"` = ערך עסקת מכירה בלבד. **אינו תנועת מזומן**.
- יש להוציא אלה מכל חישוב תזרים מזומנים, יתרת קופה, ו-partner balance.

### קטגוריות
| Category | תיאור |
|----------|-------|
| Renovation | שיפוצים בנכסים |
| Airbnb | הכנסות/הוצאות השכרה קצרת טווח |
| Management | ניהול שוטף — שכ"ד, ועד בית, ארנונה |
| JJ | הוצאות חברה כלליות |
| Sale | מכירת נכסים |
| Purchase | רכישת נכסים |
| Transfer | העברות בין שותפים |
| General | שונות |

### Payer values (8 ערכים בלבד):
`Yossi, Jacob, Anastasia, JJ, Client, Tenant, Owner, Airbnb`

### ⚠️ Purchase Capital — כלל חשבונאי מאושר (6 יולי 2026)

**Purchase Deposit אינו אינפורמטיבי כברירת מחדל.** הוא חלק מעלות הרכישה הכוללת של הנכס.

**הגדרה:** כל `Purchase Payment` ו-`Deposit` בקטגוריית Purchase הם **תשלומי הון רכישה** (Purchase Capital) — מקדמות ששולמו ע"י JJ (יוסי / ג'ייקוב) על חשבון מחיר הרכישה המוסכם.

**דוגמה:** מחיר רכישה = €200,000. JJ שילם: €5K deposit + €10K + €20K. אלו כולם תשלומי הון רכישה.

**טיפול חשבונאי לפי מחזור חיי העסקה:**

הגורם המכריע אינו סוג הנכס בלבד — הוא **מחזור החיים של העסקה**.

| מצב | טיפול |
|-----|-------|
| **נכס נשמר ב-JJ** | ה-Deposit נשאר חלק מעלות הרכישה של JJ (לא ניתן להחזר). |
| **נכס הועבר ללקוח** | ה-Deposit הופך לחלק מעלות הרכישה שהלקוח מחזיר ל-JJ (ניתן להחזר). |

> ⚠️ **אל תיישם כלל המבוסס רק על סוג הנכס (`property_definitions`).** גם נכס המוגדר כ-'client' עשוי לכלול Deposits שנרשמו לפני שהעסקה עם הלקוח הושלמה. הגורם המכריע הוא האם העסקה הגיעה לסיום (transfer/sale) — לא הגדרת הנכס בלבד.

**השלכות על המנוע (לא מיושם ב-RC1):**
- נכון לעכשיו, `deposit` נמצא ב-`SKIP_EXPENSE_SUBS` → כל שורות ה-Deposit מגיעות ל-Step 18 (Other, info-only).
- עבור נכסי לקוחות שבהם JJ שילם Deposit: הסיווג הנוכחי שגוי — תשלומים אלו צריכים להיות חלק מעלות הרכישה שהלקוח מחזיר.
- תיקון המנוע דורש **מודעות למחזור החיים של העסקה**, לא רק פילטר לפי `property_definitions`.
- יישום מלא — **שמור ליישום עתידי** (post-freeze, ייתכן RC2).

**SA-016 — סיווג מחודש:** לא "deposit = informational". במקום: **Purchase Capital — treatment תלוי lifecycle של העסקה**. ראה system_alerts_rc1.xlsx.

### ⚠️ Airbnb / Hostaway — כלל חשבונאי מאושר (6 יולי 2026)

**Platform Income = סכום נטו לבעלים** לאחר כל הניכויים בצד הפלטפורמה. שורות Airbnb מסוג:
- `Management Fee` (category=Airbnb)
- `Cleaning` (category=Airbnb)

הן שורות **מעקב פנימי / פלטפורמה בלבד** — **אינן מנוכות שוב** מיתרת הבעלים/לקוח.

| כלל | פירוט |
|-----|-------|
| אל תיצור שורת Client Charge נוספת | גם אם `client_charge` מאוכלס — זה ערך היסטורי מ-Excel, לא חיוב נפרד |
| אל תשנה יתרת הבעלים | CC על שורות Airbnb Cleaning / Mgmt Fee הוא אינפורמטיבי בלבד |
| הוצאות בעלים אמיתיות בלבד מנוכות | חשמל, מים, אינטרנט, תיקונים — רק אלו משפיעים על היתרה |

**SA-007, SA-008, SA-009 — סגורים:** CC על שורות Platform Income / BPO / Airbnb Cleaning הוא ערך היסטורי מ-Excel. לא נדרשת שורה חדשה. יתרה לא משתנה.

**כלל ייבוא Hostaway עתידי:**
בעת ייבוא דוחות Hostaway, יש לייבא:
- `Platform Income` — סכום נטו לבעלים (לאחר ניכויי פלטפורמה)
- `Cleaning` — הקצאת ניקיון (מעקב בלבד, לא ניכוי כפול)
- `Management Fee` — הקצאת דמי ניהול (מעקב בלבד)
- `Bank Payment to Owner` — סכום ששולם בפועל לבעלים
- הוצאות בעלים בפועל: חשמל, מים, אינטרנט, תיקונים — **אלו בלבד** מקטינים יתרת הלקוח

### ⚠️ Internal Offset — כלל עסקי מאושר (6 יולי 2026, מדויק יותר)

עסקאות עם מילות מפתח כגון `קיזוז`, `לסגור חוב`, `לטובת השיפוץ`, `מהשכירות`, `internal offset`, `transferred from rent` — **אינן כפולות**. יש להבחין בין שלושה דפוסים:

---

#### דפוס 1: JJ Internal Settlement (JJ כ-payer או payee)

כסף עבר דרך חשבונות JJ. הרצף החשבונאי שלם בתוך ספרי JJ.

| חוק | פירוט |
|-----|-------|
| אל תסמן כ-duplicate | גם אם נראה דומה לשורה אחרת |
| אל תמחק | שמור פעיל |
| RC1 | שמור כעסקה תקפה; סמן "Needs Review" אם נדרש |
| RC2 | מנוע הקיזוז יזהה ויתאם את הזוגות |

**דוגמה — SA-018, Liron & Alon, 15/08/2025:**  
BPO JJ→Alon €800 + BPO JJ→LIRON €1,000 + Client→JJ €800 + Client→JJ €1,000 — JJ הוא payer/payee בכולן. כולן תקפות.

---

#### דפוס 2: External Personal Payment Applied to Client Balance (Yossi/Jacob כ-payer או payee)

אחד השותפים **קיבל את הכסף אישית** (לא דרך JJ), ובמקום להחזיר — קיזז אותו מחוב הלקוח על הנכס.

| חוק | פירוט |
|-----|-------|
| אל תסמן כ-duplicate | זו עסקה אמיתית |
| אל תמחק | שמור פעיל |
| **שמור payer/payee כפי שנרשם** | חיוני לחשבונאות ברמת השותפים — יוסי ≠ ג'ייקוב ≠ JJ |
| RC1 | סמן "Needs Review / Special Adjustment" |
| RC2 | טיפול אוטומטי מלא |

**דוגמה:** רון שילם ליוסי אישית (לא ל-JJ). במקום שיוסי יחזיר — קוזז מחוב רון על הנכס. הרישום חייב להישאר Client→Yossi, **לא** Client→JJ.

---

#### דפוס 3: True Duplicate (כפילות אמיתית)

סמן `confirmed_duplicate` **רק** כשיש הוכחה עובדתית שאותו אירוע בעולם האמיתי נרשם פעמיים.

| מה **אינו** הוכחה לכפילות | מה **כן** הוכחה |
|---------------------------|-----------------|
| amount == client_charge | PDF מהבנק/Airbnb מראה תנועה אחת בלבד |
| תיאור דומה / תאריך זהה / סכום זהה | שני רישומים עם UUID שונה לאותו event_id |
| שורה ניראית "מיותרת" | אימות עם Yossi שהאירוע נרשם פעמיים |

**SA-018 — פסיקה סופית:** אל תסמן כ-duplicate אוטומטית. כל שורה בתאריך 15/08/2025 היא External Personal Payment / JJ Internal Settlement עד שיוכח אחרת באמצעות הוכחה עובדתית.

---

### ⚠️ Partner Capital Rule — עיקרון ארכיטקטוני מאושר (6 יולי 2026)

**זהות המשלם היא חלק מהמודל החשבונאי.**

תשלומים שבוצעו על ידי **Yossi**, **Jacob**, ו-**JJ** אינם ניתנים להחלפה זה בזה ואסור לנרמל ביניהם.

**הפריטים שיש לשמר תמיד:**
- ה-`payer` וה-`payee` המקוריים כפי שנרשמו
- זהות השותף — Yossi ≠ Jacob ≠ JJ בכל רכיב חשבונאי

**דוגמאות לעסקאות הדורשות שמירת זהות השותף:**
- הפקדות רכישה (Purchase Deposits) שמומנו על ידי Yossi או Jacob
- External Personal Payment Applied to Client Balance
- תשלומי רכישה שמומנו על ידי שותף
- גישור הון בין Yossi לJacob

**הסיבה:** גם כאשר עסקה אינה משנה את יתרת הלקוח, היא עשויה להיות קריטית לגישור הון ברמת השותפים. חשבונאות הון השותפים היא עצמאית מחשבונאות הלקוח.

**כללים מחייבים:**
- אל תנרמל תשלומי שותפים לתוך JJ
- אל תאבד זהות השותף בייבוא, תיקונים או מיגרציות עתידיות
- `v_cashbox_audit` מחלק לפי Yossi / Jacob / JJ — מבנה זה משקף עיקרון זה

> ⚠️ זהו עיקרון ארכיטקטוני בלבד. אין צורך בשינוי סכמה או יישום. המודל הנוכחי כבר תואם עיקרון זה.

### ⚠️ JJ Settlement Architecture — D4 APPROVED (27 יולי 2026)

**JJ היא גבול ההתחשבנות התפעולי של המערכת.**

**כלל יסוד:**

| שכבה | מי מתחשבן עם מי | דוגמאות |
|------|----------------|---------|
| **Layer 1 — JJ ↔ World** | כל צד חיצוני מתחשבן מול JJ בלבד | Anastasia ↔ JJ / Suppliers ↔ JJ / Customers ↔ JJ / Owners ↔ JJ |
| **Layer 2 — JJ ↔ Partners** | שותפים מתחשבנים מול JJ בלבד | Yossi ↔ JJ / Jacob ↔ JJ / Future partners ↔ JJ |

**כלל חוקתי:**
> Partners do not settle with employees.  
> Partners settle with the company.  
> The company settles with the world.

**כללים מחייבים:**
- אסור לחשב יתרת שותף ישירות מול עובד, ספק, לקוח, או מפעיל.
- כל יתרה חיצונית (Anastasia, suppliers, owners) מסתיימת ב-JJ.
- יתרות השותפים נגזרות מ-JJ — לא מצדדים חיצוניים.
- אסור שיהיה Dashboard שמציג "Anastasia owes Yossi" — רק "Anastasia ↔ JJ" ו-"JJ ↔ Yossi" בנפרד.

> ⚠️ אין חריגים אלא אם מוגדרים במפורש בהסכם מחייב (governing agreement).

**קשר ל-P-LEDGER-1:** P-LEDGER-1 אמר "Economic bearer ≠ Settlement Counterparty." D4 מספק את הכלל השולט: JJ היא ה-Settlement Counterparty — הן לצדדים חיצוניים והן לשותפים. D4 הוא ה-governing evidence שP-LEDGER-1 דרש.

---

## 5. קופות מזומן (v_cashbox_audit)

**View פעיל בסופאבייס.** מחשב יתרות לפי payer/payee.

### יתרות נוכחיות (נאמת 22 יולי 2026, WA-002 Phase 2 CP-Q042 execution):
| קופה | קיבל | שילם | יתרה |
|------|------|------|------|
| Yossi | 934,644.35 | 980,173.60 | **-45,529.25** |
| Jacob | 1,355,426.97 | 1,298,947.50 | **+56,479.47** |
| JJ | 422,374.25 | 369,157.85 | **+53,216.40** |

### Power BI targets (data updated 5/31/26 — לפני הייבוא האחרון):
| קופה | קיבל | שילם | יתרה |
|------|------|------|------|
| Yossi | 905,076.66 | 962,349.60 | -57,272.94 ✅ |
| Jacob | 1,354,726.97 | 1,282,447.50 | 72,279.47 ⚠️ (הפרש +1,400 בשילם) |
| JJ | 422,931.30 | 339,640.25 | 83,291.05 ⚠️ |
| Anastasia | 174,539.56 | 164,929.04 | 9,610.52 ✅ |

> הפרש JJ/Jacob — ככל הנראה בגלל 3 שורות חדשות בייבוא האחרון שלא היו ב-Power BI ב-5/31. לרענן Power BI ולבדוק שוב.

### לוגיקת Anastasia בView:
- Fabi היא עובדת (מקבלת שכר מאנסטסיה) — **אינה קופה עצמאית**
- `employee_config`: Fabi set `is_active = false` ✅
- `total_received` של Anastasia מוציא שורות salary (היא לא "מקבלת" שכר לקופה)
- `total_paid` כולל כל מה שאנסטסיה שילמה כולל שכר לפאבי

---

## 6. employee_config

```sql
-- מצב נוכחי (אחרי Fix):
-- Anastasia — role='employee', is_active=TRUE
-- Fabi (ו-fabi) — role='employee', is_active=FALSE
```

**אסור** לסמן Fabi כ-active — זה יגרום ל-Anastasia box לכלול אותה.

---

## 7. Next.js Frontend (Character Profile session)

**ספריית האפליקציה:** נבנתה ב-session `local_8ec6c229-c2f6-46b1-9311-34d0bd67b556` (Character profile).

**קבצים שעודכנו בסשן ההוא:**
- `page.tsx` — שם הקופה "Employee Account" שונה ל-**"Anastasia"**
- `.env.local` — `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_KEY`

**לגשת לקוד האפליקציה:** פתח את סשן "Character profile" — שם נמצאים כל קבצי הNext.js.

**Tech Stack:**
- Next.js + TypeScript
- Supabase (PostgreSQL) — data layer
- Tailwind CSS

---

## 8. Power BI

**Workspace:** app.powerbi.com/groups/2f9621dd-5542-4ea2-b9cf-9f15954e6f85  
**מחובר לסופאבייס** — רענן "Refresh Now" ב-Semantic Model לסנכרון.

**Pages שמוכנות:**
- Income vs Expense
- Management ✅
- Renovation ✅
- Purchase ✅
- Airbnb ✅
- Sale ✅
- Transfer
- JJ ✅
- Cash Balance
- Detailes
- Cash Balance - Anastasia
- Client Payment

---

## 9. קבצים בתיקיית JJ

| קובץ | תיאור |
|------|-------|
| `jj_clean_v2.csv` | 2,059 שורות מנוקות — הנתונים הייבוא האחרון |
| `run_import_NOW.py` | Python script לייבוא + אימות (מריצים מקומית) |
| `fix_views.sql` | SQL לתיקון employee_config + בניית v_cashbox_audit |
| `diagnose_and_fix.sql` | SQL לאבחון הפרשים |
| `changes_report.txt` | דוח 186 השורות החדשות מ-General.xlsx |
| `transactions_backup_*.json` | גיבויים של הסופאבייס (2,056 שורות כל אחד) |
| `jj_import/` | ייבוא ישן (1,823 שורות) — לא בשימוש |
| `.env` / `.env.example` | secrets מקומיים (SUPABASE_SECRET_KEY). **המקום היחיד המותר ל-secrets** |
| `verify_phase0.py` | אימות rotation: מפתח חדש + חיבור (read-only) |
| `security_audit.py` | אודיט אבטחה מלא חוזר על כל התיקייה (read-only) — להריץ אחרי כל שינוי גדול |
| `docs/ENVIRONMENT_VARIABLES.md` | רישום מרכזי של כל ה-env vars/secrets בפרויקט |
| `SECURITY_PHASE0_FINAL.md` | דוח Phase 0 (יוחלף ב-Security Baseline v2 בסגירה) |

---

## 10. Views שנוצרו

| View | תיאור |
|------|-------|
| `v_cashbox_audit` | יתרות קופה — Yossi, Jacob, JJ (ללא Anastasia) |
| `v_anastasia_clearing` | מעקב תזרים Anastasia: cash_collected, cash_on_hand, anastasia_owes_jj, jj_owes_anastasia |
| `v_employee_reimbursements` | החזרים לעובדים: paid_for_company - salary_received - transfers_received |
| `v_ceo_summary` | סיכום CEO: רווח אמיתי לפי קטגוריה (משתמש ב-v_ceo_kpis לערכי רווח) |
| `v_property_pl_split` | P&L לכל נכס מפוצל לפי אחוזי בעלות (property_owners) |
| `v_jj_company_pl` | P&L ברמת חברת JJ: הכנסה, שכר, משרד, מרקטינג, הוצאות אחרות |

### v_jj_company_pl — תוצאות עדכניות:
| סעיף | סכום |
|------|------|
| JJ Income | €68,925 |
| Salary Anastasia | €6,888 |
| Salary Fabi | €15,651 |
| Office Expenses | €17,386 |
| Marketing/Platform | €5,924 |
| Other Expenses | €12,356 |
| **Total Expenses** | **€58,205** |
| **Net Company P&L** | **+€10,720** |

## 11. Tables שנוצרו

| טבלה | תיאור |
|------|-------|
| `property_definitions` | סוג כל נכס: 'client', 'jj', 'partnership', 'jj_company' |
| `property_owners` | בעלי נכסים ואחוזים: Villa Mazotos (Avi 50/Yossi 25/Jacob 25), Villa Mazotos 2 (Oren 35/Yossi 32.5/Jacob 32.5) |
| `employee_config` | הגדרת עובדים: Anastasia active, Fabi inactive |

## 12. Task Status

- [x] ייבוא 2,059 שורות לסופאבייס ✅
- [x] v_cashbox_audit פעיל (3 קופות: Yossi, Jacob, JJ) ✅
- [x] employee_config מתוקן (Fabi מושבתת) ✅
- [x] v_anastasia_clearing — מודל clearing לאנסטסיה ✅
- [x] v_employee_reimbursements — תוקן (net_owed = €102,463) ✅
- [x] v_ceo_summary — תוקן (Real Profit = +€1,190,238) ✅
- [x] property_definitions + property_owners נוצרו ✅
- [x] v_property_pl_split — P&L מפוצל לפי בעלות ✅
- [x] v_jj_company_pl — P&L חברת JJ (Net = +€10,720) ✅
- [x] System Alerts RC1 — 21 alerts (file: system_alerts_rc1.xlsx) ✅ (updated 6 יולי 2026)
- [x] Architecture Sync approved — RC1/RC2 split decision (6 יולי 2026) ✅
- [x] **[PREREQUISITE RC1 — COMPLETE ✅]** עמודת `review_status` קיימת (TEXT, nullable, default 'active') — נאמת 8 יולי 2026
- [x] **[PREREQUISITE RC1 — COMPLETE ✅]** שורות SA-006 סומנו `confirmed_duplicate` — נאמת 8 יולי 2026 (3 שורות: Tamir dekelia, 2026-04-30)
- [ ] Task 4: Validate v3 — **חסום** עד לאישור G1–G5 + Architecture Review
- [ ] Task 5: Build contact_opening_balances — **חסום** עד Task 4 מאושר
- [ ] Power BI רענון + אימות שמספרי JJ/Jacob מתאימים
- [ ] Next.js אפליקציה — עדכון לשימוש ב-v_anastasia_clearing + v_cashbox_audit חדש
- [x] **PMS Connector — Phase 0 Security** הושלם (9 יולי 2026): secrets הוסרו מכל הקבצים → env var/.env. ראה `PMS_CONNECTOR_ADR_v1.md`
- [x] **PMS Connector — Phase 0 סגור ✅ (10 יולי 2026):** Rotation בוצע (מפתח `jj_scripts_2026_07`), המפתח הישן נמחק מה-Dashboard, ה-PAT שנחשף נמחק מ-GitHub, `verify_phase0.py` PASS (חיבור חי, 2,127 שורות), `security_audit.py` PASS. ראה `SECURITY_BASELINE_V2.md`
- [x] **PMS Connector — Phase 1 הורץ ✅ (10 יולי 2026):** migration `pms_phase1_001_schema` הוחלה בהצלחה אחרי Review מאושר. סכמת `pms`: 10 טבלאות, RLS deny-all (0 policies), 0 FK בין-סכמות, seed hostaway. `public.transactions` לא נגעה (2,127). Rollback: `DROP SCHEMA pms CASCADE`. הבא: Phase 2 — Hostaway auth (secrets ל-Vault)
- [x] **PMS Connector — Phase 2 Hostaway Auth: PASS ✅ (10 יולי 2026):** מפתח API `jj-connector` נוצר ב-Hostaway (לא לגעת במפתח `whatsapp API key` הקיים!). Credentials אך ורק ב-Supabase Vault: `hostaway_account_id`, `hostaway_client_secret`. Edge Function `pms-hostaway-auth-test` (read-only, verify_jwt): token תקף ~731 ימים, listings HTTP 200, **8 נכסים ב-Hostaway**. הבא: Phase 3 — משיכת listings ל-pms.raw_properties
- [x] **PMS Connector — Phase 3 Listings Sync: הושלם ✅ (10 יולי 2026):** `pms.connections` נוצרה (account מה-Vault ישירות); Edge Function `pms-hostaway-sync-listings` v0.1.1; **8/8 listings** ב-`pms.raw_properties` (הכל נכסי TelMar בקפריסין, EUR); ריצה חוזרת = 8 unchanged (idempotency הוכחה); reservations=0, canonical=0, transactions=2,127 ללא שינוי; אפס DDL. תוקן באג double-encoding של jsonb (v1→v2 עם sql.json). הבא: Phase 4 — reservations sync (afterId, צ'אנקים) — באישור יוסי
- [x] **PMS Connector — Phase 4 Reservations Sync: הושלם ✅ (10 יולי 2026):** **589/589 הזמנות** ב-`pms.raw_reservations` (reconciliation מול Hostaway count). Edge Function `pms-hostaway-sync-reservations` v0.2.2 — chunked (maxPages להזמנה), bulk upserts, throttle 700ms, offset pagination. **Finding: afterId cursor לא עובד בחשבון הזה (ה-API מתעלם) — offset בשימוש; לשאול את Hostaway support.** Idempotency: ריצה מלאה חוזרת = 589 unchanged. PII (email/phone) קיים ב-raw — מוגן RLS deny-all; ccNumber/cvc ריקים תמיד (0/589). transactions=2,127 ללא שינוי, canonical=0, אפס DDL. הבא: Phase 5 — normalize ל-canonical
- [x] **PMS Connector — Phase 4.1 + Phase 5 הושלמו ✅ (10 יולי 2026), ממתינים ל-Review של יוסי:** PCI sanitizer v1.0.0 בכל ingest (19/19 טסטים, `pms_connector/`); אפס שדות תשלום רגישים בכל הגרסאות; canonical: 8 נכסים + 589 הזמנות (mapper 1.0.0, idempotent 0/0); 11 שורות status=unknown להכרעה; אפס מיפוי אוטומטי לנכסים (worksheet); Financial Discovery: airbnb payout=base+cleaning−hostFee (91/99), booking commission 15-20%, financeField/reservationFees ריקים. ראה `PMS_PHASE5_REVIEW_PACKAGE.md`. **הערה: transactions=2,154 (+27 מהזנה עסקית רגילה 10/7, לא מהצנרת)**
- [x] **PMS Connector — Phase 6+7 הושלמו ✅ (10 יולי 2026):** מיפוי נכסים מבוסס-ראיות (Excel 'שמות הנכסים' + כתובות + היסטוריית ספרים): **5 מאושרים** (Oren Kitty exact; Tamir Dekelia, Tamir Radisson, Villa Mazotos, Apartment Neer Yoav Dekelia high), 2 proposed לא-מוכרעים (TM05: Ofri makarios מול Ofri Makarios 5 Floor; 510557), 1 unmapped (534350). נוסחת Airbnb תוקנה: **payout = totalPrice − hostFee (96/99)**; cleaning סמכותי פר-ערוץ. UI אדמין: `pms_admin_debug.html` + Edge Fn `pms-admin-status` (דוחה anon — 403). ראה `PMS_PHASE6_7_COMPLETION.md`. ממתין להכרעות יוסי: TM05, 510557, 534350, קשר Efi/Sunrise
- [ ] **Ownership Milestone — בשלבי סגירה (10 יולי 2026). ⚠️ FREEZE פעיל על property_owners/ownership views/דשבורדים.** גילוי מרכזי: seed גורף 50/50 → €906,778/שותף מיוחס בטעות מנכסי לקוחות (v_property_pl_split ללא סינון). Semantics אושר; Worksheet v2 + Stage A/B + delta מוכנים ולא הורצו. הכרעות שבוצעו: Jacob Oroklini הוסר כנכס (tx→NULL, מורשה); Ofri קנוני='Ofri Makarios 5 Floor'; Neer Yoav→Efi temporal (תאריך+€58,824 פתוחים). חבילת סגירה: `OWNERSHIP_MILESTONE_CLOSURE.md`. ממתין: R1 חתימות קבוצה A, R2 תאריך Neer Yoav, R5 אימות קבוצה B, R6 בדיקת PBI. **אסור לגעת בשכבת הבעלות עד הסרת ה-FREEZE ע"י יוסי**
- [x] **PMS Connector — System Design Review אושר** (9 יולי 2026): כלל הזהב (drop pms ≠ שבירה), הפרדת entity-registry מ-pms_property_mappings, אין FK בין-סכמות, אין מיזוג רישומים. ראה `PMS_SYSTEM_DESIGN_REVIEW.md`. אחרי Phase 0 PASS — מותר להכין את מיגרציית Phase 1 לביקורת
- [x] **M0 Operational Readiness — סטטוס (12 יולי 2026):** M0.1 PMS Production + M0.2 Identity Authority = **In Validation** (שעון אוטונומיה 7 ימים עד **18/7/2026**, אפס התערבות ידנית); M0.3 Monitoring = CLOSED; **M0.4 Admin Console** — PR #16 (`m04/admin-console` → `src/app/admin/pms/page.tsx`). **באג "Signing in..." בפריוויו אובחן ותוקן (12/7):** ה-branch נחתך לפני commit `d7a99e5` (login עבר ל-cookie client); תוקן ע"י merge של main ל-branch (PR #24) + commit שמעביר את דף האדמין ל-`createSupabaseBrowserClient` מ-`@/lib/supabase` (אסור client נפרד — double GoTrueClient). **אומת E2E על הפריוויו עם משתמש QA זמני (נמחק): login → dashboard → /admin/pms חי.** ראיה נוספת: **אירועי webhook אמיתיים ראשונים מ-Hostaway התקבלו** (reservation.updated). ממתין: QA של יוסי (5 סעיפים) → merge PR #16 → M0.4 In Validation. Watch-item (לא חוסם, קיים גם ב-main): bounce חד-פעמי ל-`/login?next=/` מיד אחרי sign-in
- [ ] **Security Follow-up (נפרד, לא חוסם):** JWT secret rotation — ה-service_role JWT הישן נחשף ב-`auth_dump/env_local.txt` (נוקה מהקובץ, אך הטוקן עצמו עדיין תקף). סיבוב מנתק גם anon key → דורש עדכון env ב-Vercel + redeploy של האפליקציה. לתאם חלון תחזוקה
- [x] **M8 Investment Lifecycle — CLOSED ✅ (13 יולי 2026):** lifecycle schema (7 טבלאות, RLS deny-all, 3 views), Business Validation PASS (Avi + Oren), Real Portfolio Validation PASS, migration 003 (nullable dates + date_confidence). ראה `M8_RETROSPECTIVE.md` + `M8_CONSTITUTIONAL_PRINCIPLES.md` (9 עקרונות חוקתיים P-ARCH-1…P-ARCH-9). **המיילסטון הבא: M9** — Investment Timeline + Historical Data Entry + Business Intelligence Layer.
- [x] **JHKA Phase 1 — Organizational Knowledge Baseline Established ✅ (16 יולי 2026):** Knowledge Boundary Mapping complete. 5 deliverables approved (D1 Baseline v1.1, D2 Source Inventory v1.2, D3 Question Backlog v1.1, D4 Decision Batch Roadmap v1.2, D5 Knowledge Gap Report v1.1). 21 enhancements applied via Architecture Review. 3 governance models established (Source/Gap/Question). 14 gaps identified (3 Critical), 27 questions queued in 6 Decision Batches (DB-001…DB-006). Evidence Snapshot rule added. Closure Report: `JHKA_PHASE1_CLOSURE_REPORT.md`. **הבא: DB-001 (Source Inventory Questions)**
- [x] **DS-009B Fabi Accommodation + Uriel Management Fee — CLOSED ✅ (20 יולי 2026):** CP-DS009B-WAIVER (Management Fee CC 500→0, waived by Yossi) + CP-DS009B-VIEW (Staff Accommodation Rent reclassified: rent_collected +€1,000, expenses −€1,000). Combined: Uriel owner_balance 3,000→5,500 (+€2,500). 28/28 verification gates PASS. Cashboxes unchanged. Business rules: (1) Staff Accommodation Rent = owner entitlement, not expense; (2) Uriel annual Management Fee waived by JJ. ראה `DS_009B_DECISION_PACKAGE_v2.md`
- [x] **M9-C: Partner Report Screen Foundation — MERGED ✅ (15 יולי 2026, PR #51, Merge SHA: `44b1eaff`):** route handler `src/app/partner/[slug]/page.tsx` + 8-step auth chain (`partnerAuthService.ts`); `PartnerStatementDTO` v1.0 locked (discriminated union: `PartnerFacingStatementDTO` / `AdminStatementDTO`); 4 components: `PartnerReport`, `PartnerCapitalSection`, `PartnerFinancialSection`, `PartnerTimelineSection`, `PartnerPortfolioSection`; 28 tests PASS. P-ARCH-1: NULL → em dash (no coercion). P-ARCH-6: no jj_* fields in partner-facing type. Settlement `currentBalanceEur = null` until RC2 — not inferred. PDF/CSV disabled (placeholder until Settlement Engine). CI: PASS. Branch: `feat/m9c-partner-report` DELETED. **הבא: Partner Report QA + Modern Visual Polish.**
- [x] **PR-R1: Welcome + Executive Summary (Partner Report Story) — MERGED ✅ (16 יולי 2026, PR #56, Merge SHA: `68a57a3f`):** WelcomeHeader + ExecutiveSummary components; HealthSignal + BusinessHealthStatus added to DS barrel (CI fix); 18 tests PASS. Branch: `partner-report-2035/r1-executive-summary` DELETED. **הבא: R2 — Business Story + Property Health.**
- [x] **PR-R2: Business Story + Property Health (Partner Report Story) — MERGED ✅ (16 יולי 2026, PR #57, Merge SHA: `f293cbc0`):** PropertyHealth (Section 3) + BusinessStory (Section 4); deriveHealthStatus() helper; DS barrel fix (HealthSignal exports lost in R1 squash — restored); 21 tests PASS. Branch: `partner-report-2035/r2-business-story` DELETED. **הבא: R3 — Income + Expenses.**
- [x] **PR-R3: Income + Expenses (Partner Report Story) — MERGED ✅ (16 יולי 2026, PR #58, Merge SHA: `bef71c3`):** IncomeTable (Section 5) + ExpenseTable (Section 6); 21 tests PASS, 3 checks PASS, Vercel PASS, 692 additions, 3 files. Branch: `partner-report-2035/r3-income-expenses` DELETED. DTO contract verified: both components accept `readonly RC3AccountSection[]`, read engine-computed totals only (no independent balance calculation), platform tracking rows excluded via `display_group` + `balance_effect === 0` guard. P-ARCH-1 ✅ (IncomeTable → null when zero; ExpenseTable → empty-state message). **⚠️ Not yet wired into PartnerReport.tsx — ExecutiveSummary still receives `income={null}`, `expenses={null}`, `netResult={null}` hardcoded. Wiring is the next Track A item (see RC3 Financial UI Wiring below).**
- [x] **PR E3-A1: DailyGreeting + AllClearCard — MERGED ✅ (16 יולי 2026, PR #55, Merge SHA: `47287176`):** DailyGreeting, AllClearCard, homeTypes, homeService, /home route; DS barrel cleanup (HealthSignal dedup); TypeScript fix (`PageShell title` prop removed — TS2322); CI PASS (typecheck ✅ tests ✅ vercel ✅); FR-001 ✅ FR-002 ✅; post-merge: 4/4 verification PASS (commit on main + DailyGreeting + AllClearCard + index.ts). Branch: `design-system-2035/e3-a1-daily-greeting` DELETED.
- [ ] **Design Audit Checkpoint — אחרי R4 (מאושר 16 יולי 2026):** לפני המשך לעוד מודולים (CRM, Calendar, Mobile) — יום אחד של audit על כל המסכים. שאלת המבחן: "האם כל המסכים נראים כאילו יצאו מאותו מוצר?" תוצאה: רשימת תיקוני עקביות לפני הרחבת השפה.
- [x] **PR-R4: Timeline + Settlement + What's Next — MERGED ✅ (PR #59, Merge SHA: `20a4387`):** HighlightTimeline (Section 7) + SettlementCard (Section 8) + NeedsAttentionItems (Section 9); 29 tests PASS, CI PASS, 3 checks PASS. Branch: `partner-report-2035/r4-timeline-settlement-actions` DELETED. SettlementCard + NeedsAttentionItems wired into PartnerReport.tsx ✅. F4 fix: SettlementCard outside `financial` guard — renders when financial=null.
- [x] **PR #67: fix(rc3): replace anon singleton with createServiceClient in fetchReport — MERGED ✅ (21 יולי 2026, Merge SHA: `890bc5c`, main HEAD):** ROOT CAUSE FIX — `fetchReport.ts` used a module-level anon singleton (`createClient + ANON_KEY`) blocked by `transactions` RLS (`auth.role() = 'authenticated'` required). Resolution: `createServiceClient()` inside the already-authorized server-side reporting path (`partnerAuthService` is the authorization boundary, not the DB client). `reportingName` guard added. `server-only` package deferred (not in package.json) — open as separate follow-up Issue. Verified Production Ready. **RC3 data pipeline now end-to-end: Transactions → RC3 views → fetchRC3Report → PartnerStatementDTO ✅.**
- [x] **PR #68: RC3 Financial Presentation Layer — MERGED ✅ (21 יולי 2026, Merge SHA: `85a6753fd9fc13f2a64cec402bf995a06864f780`):** DTO v1.2 — `PortfolioSummary` gains `operationalIncomeEur`, `operationalExpensesEur`, `operationalNetResultEur` (rental + airbnb only, Renovation/Sale excluded). `roundEur` IEEE 754-safe helper. `buildPortfolioSummary` filters to `OPERATIONAL_ACCOUNT_TYPES = new Set(['rental', 'airbnb'])` (single source in `executiveSummary.ts`). `PartnerReport.tsx` wired — `ExecutiveSummary` receives values exclusively from `dto.portfolio`. 7 files. PORT-F1..F12 + ROUND-01..07 + SCHEMA-18 PASS. CI: `conclusion: success` ✅. Production: Vercel `success` ✅ (10:18:56Z). Branch: `rc3/financial-presentation-layer` DELETED.
- [x] **AV-1 Pilot — Villa Mazotos Operational & Renovation Accounting: VALIDATED ✅ (21 יולי 2026):** 4 validations: AV-001 Renovation PASS, AV-002 Rental PASS, AV-003 Airbnb TECHNICAL PASS, AV-004 Portfolio PASS. Operational totals confirmed: income €1,360 / expenses €14,828.29 / net −€13,468.29. Scope: `transactions → RC3 views → engine → DTO → UI`. **Not yet validated:** Purchase/Capital, Transfers, Settlement, Sale, Owner/Client Report, PDF/CSV, Opening Balances, Internal Offsets. Open item: KI-003 (2 Airbnb "Other" rows, €336.33). Ledger: `AV1_LEDGER.md`. **הבא: AV-005 — Villa Mazotos Purchase & Capital.**
- [x] **ADR-003 Decision Access Layer — APPROVED ✅ (22 יולי 2026):** מסמך חוקתי #4. חמישה ממדי גישה (Awareness/View/Evidence/Approve/Execute), 8 עקרונות חוקתיים (DAL-1…DAL-8), Declarative Decision Classification, Effective Access Evaluation, Separation of Duties. ראה `ADR-003_DECISION_ACCESS_LAYER.md`.
- [x] **DAL v0.1 + M0 Chief of Staff MVP — MERGED ✅ (PR #69, 22 יולי 2026, Merge SHA: `ff18329`).** 19 קבצים (17 חדשים + 2 modified). DAL: 5 קבצים (types, policies, evaluateAccess, resolvePrincipal, barrel). M0: 4 lib + 4 UI + 1 declaration. Tests: 3 קבצים (~63 tests). Modified: `home/page.tsx` (Executive Brief wiring + force-dynamic), `page.tsx` (force-dynamic fix). **DAL fail-closed. `allowCompanyExecutiveView` ב-Gate 7 בלבד (company-wide), לא עוקף entity-scope. `superadmin` = temporary proxy (`NEEDS_CEO_ROLE_CONTRACT` open). `resolvePrincipal` server-only, לא מיוצא מ-barrel.** אין SQL, אין migrations, אין שינויי partnerAuth או פיננסים. **הבא: Product Review של /home עם Executive Brief חי.**
- [x] **Finance Knowledge Graph — First Decision Vertical Slice — MERGED ✅ (PR #70, 23 יולי 2026, Merge SHA: `2e7e34eb88162887fd98f09f4883ba9b7f72190a`).** Finance schema Production Certified. Migration Gate: 25/25 PASS. Architecture PASS + Product PASS + DNA PASS. Branch `feat/finance-decision-vertical-slice` נמחק. CI PASS pre-merge. שרשרת Evidence→Claim→Position→Decision→Explanation→Immutable Audit מוכחת end-to-end. RC2 Action Items: RC2-FINANCE-001 (EvidenceSourceType sync) + RC2-FINANCE-002 (Finance Glossary). **אסור להתחיל RC2 ללא Gate חדש.** ראה Section 13.14.
- [x] **Hostaway Property Audit Foundation — MERGED ✅ (PR #71, 23 יולי 2026, Merge SHA: `0562e0ae40e4734bfc0985d7683503763a06b4ee`).** Read-only audit service + DTO contract v2 for comparing Hostaway reservation data against JJ accounting records. 7 קבצים (5 lib + 2 test), 86 tests (39+47), CI PASS. Period-aggregate matching (JJ records multi-month Platform Income; Hostaway per-reservation). `isRevenueEligible()`: only `confirmed`/`modified` enter financial totals. `AuthoritativeAmount` with source/confidence chain. 8-state `AuditMatchState` taxonomy. Airbnb `airbnbExpectedPayoutAmount` (reported) priority; Booking.com calculated/estimated only. No UI, no migrations, no DB writes. Branch `hostaway/property-audit-contract-v2` נמחק. **Consumed by:** CFO, Chief of Staff, Owner Workspace, PR #3 UI. **Reservation-level financial reconciliation לא נתמך עדיין — ההשוואה היא period-aggregate.** ראה Section 13.15.
- [x] **G1 Identity Authority Consolidation — CLOSED ✅ (PR #73, 25 יולי 2026, Merge SHA: `f00adf40f72cc4fe4175109d253c0ac93659802c`).** Owner Workspace unified behind `lifecycle.entity_identity` + `management_relationship` via `identityResolverService`. `KNOWN_OWNERS` removed. 7 קבצים (5 added + 2 modified), 39 identity tests + updated resilience tests, CI PASS. ADR-006 updated: R7 Foundation→Production, MISSING→STABLE; R11 identity boundary MISSING→DRAFT; Active Boundary Conflicts 2→1. G3-A+G3-B CLOSED (PRs #76+#77). Branch `identity/authority-consolidation-g1b` נמחק.
- [x] **G3-A Financial Boundary — CLOSED ✅ (PR #76, 25 יולי 2026, Merge SHA: `d58f6dce`).** `ownerWorkspaceService` no longer reads `public.transactions` or calls RC3 RPCs directly. Financial data flows only via `ownerFinancialAdapter` + `ownerMaintenanceAdapter`. Branch deleted.
- [x] **G3-B Owner Workspace Reservations + Portfolio Hostaway Alignment — CLOSED ✅ (PR #77, 26 יולי 2026, Merge SHA: `bf43d10e6c07f0085cdb77d26071e81cd4e435cb`).** 6 new files + 1 modified. G3-2 (no pms.* reads), G3-5 (no local revenue arithmetic), G3-19 (guest masking: historical→`[Guest]`, active/upcoming→full name, null→null), P-ARCH-1 preserved. G3-17 (no PropertyAuditService import in service) + G3-18 (no adapter-to-adapter imports) verified. Architecture: `ownerWorkspaceService` → `ownerReservationService` → `ownerReservationAdapter` → `PropertyAuditService`; `ownerPortfolioAdapter` → `listAuditableProperties()` only. 2 CI fixes during loop: `case 'unknown'` (not in ReservationStatus union) + `jest.clearAllMocks()` vs `jest.resetAllMocks()`. CI PASS. Branch `owners/g3b-reservations-portfolio-alignment` נמחק. **G3-C (Owner Audit Composition) — DEFERRED.**
- [x] **NAV-1 Phase 1 — Vision & Information Architecture: LOCKED ✅ (27 יולי 2026).** 10-part deliverable: Vision Lock, User/Role Model, User Journeys, Responsibility Map, Sidebar Reconciliation (18 items audited), Target Navigation Architecture (Option A: Responsibility-Based, ~6 items), Context Contract, Route Strategy, Language Seed, Decisions. Component Ownership Rule + Navigation Budget + Exit Rule added. ראה `NAV-1_PHASE1_VISION_AND_IA.md`. Parts 1–9 LOCKED, Part 10 living.
- [x] **NAV-1 Phase 4 — Composition Rules v1.0: LOCKED ✅ (27 יולי 2026).** Valid Layout Trees (Tree A: Tabbed Workspace, Tree B: Single-Section Page), 7 Containment Rules, 9 Forbidden Combinations, nesting depth constraint (max 4), 5 composition invariants. Amendment required before adding new Layout Tree. ראה `NAV-1_PHASE4_COMPOSITION_RULES.md`. **NAV-1 Architecture Complete — Implementation authorized via Implementation Gates v1.1.**
- [x] **NAV-1 PR #78 — OperatingFrame + Home Slice: MERGED ✅ (PR #78, 28 יולי 2026, Merge SHA: `5bf79584028282faedff03b6d6e221d528bfead7`).** First validated NAV-1 vertical slice. 26 files (17 new + 2 modified + 5 moved + 2 CI remediation). Vertical Slice: OperatingFrame → Home Workspace → PageShell → WorkspaceHeader. Route group `(app)/` isolates internal routes; partner routes (`/partner/[slug]`) remain outside OperatingFrame. Amendment approved: OperatingFrame renders `<div id="main-content">` not `<main>` (Phase 3 → v1.2). Tests: 6 files, 22 component contracts (react-test-renderer@18.3.1). Gates 0–4 ALL PASS. CI Run #306 PASS on main. Branch `nav1/operating-frame-home-slice` DELETED. ראה `NAV1_PR1_AMENDMENT_PROPOSAL.md`. **Reference Case #1.**
- [x] **PR #79 — Home Workspace Completion: MERGED ✅ (PR #79, 28 יולי 2026, Merge SHA: `33113896ada9a28d6866cda75e550c27696fe08f`).** Reference Case #2. Replaced all hardcoded placeholders in Home (Positions 1–3) with real business information from `ExecutiveBriefDTO`. Zero new providers — pure transform `buildHomeBrief()` derives entire Home state. 9 files (5 new + 3 replaced + 1 fix commit). `allClear` truth table: `true` (AllClearCard) / `false` (NeedsAttentionSection) / `null` (HomeUnavailable). Contract Hardening: Total Function (never throws), Authority Boundary (no service calls), Provider Isolation (adding providers never changes Home). Tests: 2 files (~50 assertions), totality (25 combinations), determinism (100 iterations), import audit (18 forbidden patterns). Gates 0–4 ALL PASS. CI PASS on main. Branch `home/workspace-completion-pr79` DELETED. **Reference Case #2.**
- [x] **PR #80 — Owner Entity Context: MERGED ✅ (PR #80, 28 יולי 2026, Merge SHA: `dfd0636046cf632454be595dc0dec362cd56d6a2`).** Reference Case #3. Proves workspace-to-frame entity communication: Owner Workspace sets `GlobalContext.entityContext` via `EntityContextBridge` (client component), clears on unmount and workspace change. No prop drilling through OperatingFrame. No GlobalContext shape changes. Deterministic exit to `/owners` (Nav Principle 10). Identity from existing `getOwnerWorkspace()` — no new authority. 4 files (2 new + 2 modified). 18 tests (7 behavioral + 11 source audits). Contracts: C.2 (EntityContext — FIRST REAL TEST), D (GlobalContext — FIRST RUNTIME CONSUMER), Nav Principle 10 (FIRST REAL TEST). 1 CI fix (JSDoc token in source audit — same class as PR #79). Gates 0–4 ALL PASS. CI PASS on main. Branch `rc003/owner-entity-context` DELETED. No amendment required. **Reference Case #3.**
- [x] **RC-004 PR #83 — CEO Workspace: MERGED ✅ (PR #83, 29 יולי 2026, Merge SHA: `75e994370e82594495e0c5246c5768f997559838`).** Reference Case #4. CEO Workspace at `/ceo` — Tree A (Tabbed Workspace) with 2 tabs: Company (placeholder) + Brief (reuses existing `getAuthorizedExecutiveBrief()` + `ExecutiveBrief` component). 4 files (3 new + 1 modified): `src/app/(app)/ceo/page.tsx`, `src/components/ceo/CeoTabNavClient.tsx`, `src/components/ceo/CeoWorkspaceHeader.tsx`, `src/lib/nav/workspaceRegistry.ts` (added `ceo` workspace registration + CEO-only visibility). Contract B (Workspace — FROZEN) fulfilled: all 6 slots provided. Contract E.1: CEO role only. `attentionProvider: async () => null`. No new DS components. No constitutional amendments. Legacy `/` page.tsx unchanged. Gate 0 checklist 10/10 PASS. CI PASS on main. Branch `rc004/ceo-workspace` DELETED. **הבא: Screen Alignment (Finance → PageShell) → Final Design Audit Gate.**
- [x] **NAV-1 Phase 3 — Component Contracts v1.2: LOCKED ✅ (27 יולי 2026, amended 28 יולי 2026).** מסמך חוקתי #8. Constitutional First scope — 7 architectural components (OperatingFrame, WorkspaceShell, PageShell, TabNav, GlobalContextProvider, AttentionLayer, WorkspaceHeader). 11-field contracts per component. Responsibility Chain invariant. Cross-Component Containment Map. Stability Tiers (FROZEN/STABLE). v1.1 amendments: G8 streaming-safe, configurable timeout, WH-F5 exit route ownership, EXPERIMENTAL tier note. Implementation: NOT AUTHORIZED. ראה `NAV-1_PHASE3_COMPONENT_CONTRACTS.md`. **הבא: Phase 4 — Composition Rules (באישור יוסי).**
- [x] **NAV-1 Phase 2 — Navigation Contract v1.1: LOCKED ✅ (27 יולי 2026).** מסמך חוקתי #7. 5 contracts: A (Operating Frame — FROZEN), B (Workspace — FROZEN), C (Business Module — STABLE), D (Global Context — STABLE), E (Role Visibility — EXPERIMENTAL). Cross-Contract Rules + Workspace Registry appendix (7 workspaces, governance). Single direction of dependency: Module → Workspace → Frame. ראה `NAV-1_PHASE2_NAVIGATION_CONTRACT.md`. **Implementation: NOT AUTHORIZED. הבא: Phase 3 — Component Contract (באישור יוסי).**
- [x] **JJ Capability Architecture v1.0 — APPROVED ✅ (28 יולי 2026).** מסמך חוקתי #9. 3 שכבות (Foundation/Business/Intelligence), 24 Capabilities עם 9-field contracts (Purpose, Depends On, Enables, Authorities, Consumers, Boundary, Owner, Unproven Question, Success Criteria). שני מודלי בשלות עצמאיים: Capability Maturity (0–4) + AI Autonomy (A0–A4). Production Gate (8 exit criteria). Capability Lifecycle (Business Problem → Evolution). Evidence Index (כל בשלות נתמכת בראיה). Dependency Graph. RC Coverage (7/24 RC-proven, 0/24 Production). ראה `JJ_CAPABILITY_ARCHITECTURE_V1.md`. **כלל מחייב:** כל יוזמה חדשה חייבת לענות: (1) לאיזו Capability היא שייכת? (2) מה רמת הבשלות הנוכחית? (3) האם צריך RC חדש?
- [x] **Owner Workspace P0 Architecture — LOCKED ✅ (7 אוגוסט 2026).** Four planning documents (v2.3) cross-verified, 6 consistency checks PASS, 0 contradictions. Documents: `docs/planning/OWNER_WORKSPACE_BLUEPRINT.md`, `OWNER_WORKSPACE_SCREEN_MAP.md`, `OWNER_WORKSPACE_DATA_REQUIREMENTS.md`, `OWNER_WORKSPACE_IMPLEMENTATION_ROADMAP.md`. Four-layer model (Entity Identity → JJ Relationship → Service Engagement → Property). Immutable `property_id` UUID. 66 data integrity invariants. 10 conceptual entities. 6 phases (P0–P5). **Implementation NOT AUTHORIZED** — blocked on: Liora/Oshrit truth recovery completion + Architecture Review PASS. Next build phase: P1 (Identity + Property + Wizard Steps 1–3). 16 open business decisions (Q1–Q16, phase-blocked). **אסור לשנות את ארכיטקטורת P0 אלא אם מתגלה סתירה אמיתית.**
- [x] **JJ Navigation Principles v1.0 — LOCKED ✅ (27 יולי 2026).** מסמך חוקתי #6. 10 עקרונות: responsibility-based nav, stability, no unfinished domains, single authority, single owner, cognitive load, role-aware, external isolation, navigation budget (ADR/amendment required), deterministic exit. ראה `JJ_NAV_PRINCIPLES.md`.

  **⚠️ Architecture Decision — אושר יוסי 21 יולי 2026:** PR יחיד "RC3 Financial Presentation Layer" = DTO v1.2 + PortfolioSummary + service + UI wiring, ללא חישוב ב-UI. **"כל מספר במערכת צריך לענות: מאיפה באת?" — אם התשובה היא PartnerReport.tsx, עשינו משהו לא נכון.** `ExecutiveSummary` יקבל ערכים אך ורק מ-`dto.portfolio`, לא מ-`reduce` ב-PartnerReport. כלל: `UI only renders. Business Logic lives in the engine.`

### M9 — הגדרת מיילסטון (אושרה 13 יולי 2026)

**שאלת M8:** "האם המערכת מבינה נכון את המציאות העסקית?"
**שאלת M9:** "איך הופכים את אותה מציאות העסקית לכלי עבודה יומיומי?"

**M9 Scope (סדר ביצוע — עודכן 13 יולי 2026):**

> **⚠️ סדר עבודה מתוקן:** M9-D קודם ל-M9-A. בניית Timeline עם תאריכים NULL מייצרת ציר זמן עם חורים מהיום הראשון. אימות התאריכים ממסמכי המקור תחילה מבטיח Timeline אמין בעת הפריסה.

1. **M9-D: Source Date Verification** — לכל רשומה ב-lifecycle שיש לה `date_confidence = 'pending_verification'`: יוסי מספק תאריך ממסמך מקור (חוזה / העברה בנקאית / נוטריון) → UPDATE effective_from/effective_date, set confidence = 'confirmed'. שמירה על NULL כאשר אין מקור אמין.

   **ארכיטקטורה מתוקנת (13 יולי 2026):** `pending_verification` הוא **מצב נתון** (data state). ה-M9-D מוסיף שכבת **מצב עבודה** (work state) נפרדת — טבלת `lifecycle.verification_tasks`. כל NULL + pending_verification מייצר task מוגדר עם: שדה חסר, מקור מצופה, סדר חיפוש, עדיפות, סטטוס. זה הופך "נתונים חסרים" ל"תור עבודה מנוהל". JHKA הוא מנוע החיפוש העתידי — יחפש ראיות לפי search order, יציע לאישור (לעולם לא יאשר בעצמו). ראה Section 13.8.

   **✅ M9-D CLOSED WITH DOCUMENTED PENDING EVIDENCE (13 יולי 2026):** migration `m9_d_verification_tasks` הוחלה. 5 tasks נוצרו (3 HIGH + 2 MEDIUM). 0 תאריכים אושרו — אין מסמכי מקור זמינים. 4 תאריכים נשארים NULL + pending_verification. 14/14 validations PASS. ראה `M9D_CLOSURE_REPORT.md`.
2. **M9-A: Investment Timeline Read Model** — `v_investment_timeline`, TypeScript types, projection service. UI ב-`/owner/[owner]/[property]/timeline`. עכשיו עם תאריכים מאומתים. כל אירוע יוצג עם `date_confidence` שלו.
3. **M9-B: Historical Data Entry** — SA Cases + 22 שורות → Anastasia BATCH-0001 → שאר כניסות משקיעים. כל batch: Yossi-authorized facts בלבד, DO block + inline validation, COMMIT רק אחרי 100% PASS.
4. **M9-C: Business Intelligence Layer** — `bi` schema, views בלבד, נגזר מ-Lifecycle + Accounting. לא מקור אמת. שאלות: כמה Margin ייצרה JJ? כמה הון עדיין חסר? מה החשיפה הכוללת?
5. **M9-E: GitHub Delivery** — push migration 003 + view hotfix לענף main.

**כלל מחייב ל-M9:** אסור לגעת ב-`public.transactions`, ב-Accounting Engine, ב-Settlement Engine, ב-Client Report RC3. כל עבודת M9 היא additive בלבד.

**כלל חוקתי — תיקון M8 (אושר 13 יולי 2026):**
> עיקרון חוקתי חדש (P-ARCH-10 ואילך) יתווסף **רק** אם הוא פותר סתירה שאינה ניתנת לפתרון בתוך תשעת העקרונות הקיימים. כל רעיון חדש חייב להוכיח תחילה שאינו נובע כבר מ-P-ARCH-1…9. מניעת "אינפלציה" של עקרונות לאורך השנים.

---

## 13. Client Report RC1 — ארכיטקטורה

### RC1 Scope (מאושר 6 יולי 2026)

**בפנים RC1:**
- `classifyTx()` — מנוע שיוך שורה-לשורה, ללא מצב, עם שרשרת 18 צעדים
- משוואת איזון: `Opening Balance + Platform Income + Client Payments + Charges Billed − Expenses − Bank Payments to Owner = Closing Balance`
- System Alerts — חישוב in-memory, ללא טבלה קבועה (RC2 scope)
- עמודת `review_status` בטבלת transactions — פילטר לשורות `active` בלבד
- סימון כפולות כ-`confirmed_duplicate` (לא מחיקה פיזית)

**מחוץ ל-RC1 (נדחה ל-RC2):**
- Cross-Property Settlement Engine
- זיהוי אוטומטי של זוגות קיזוז בין נכסים
- קטגוריה ייעודית "Cross-Property Settlement" במנוע
- אימות same-contact לפני אישור קיזוז
- workflow אישור ניהולי לקיזוזים
- persistent `accounting_alerts` table + alert workflow

### עקרונות בסיס מאושרים

| עיקרון | פירוט |
|--------|--------|
| Client is accounting owner | כל נכס יש לו חשבון נפרד; דוח Contact מאחד נכסים לאותו איש קשר |
| Cross-property settlements | RC2 בלבד — ב-RC1 מסומנים כ-Needs Review |
| ClientCharge ≠ Amount → כפול | CC שווה Amount הוא שדה היסטורי, לא ראיה לכפילות |
| אין מחיקה פיזית | שורות כפולות → `confirmed_duplicate` / `ignored`, לא DELETE |
| Alerts → in-memory ב-RC1 | persistent alerts table → RC2 |
| **Partner Capital Rule** | Yossi ≠ Jacob ≠ JJ — זהות המשלם חייבת להישמר. אסור לנרמל תשלומי שותפים. חשבונאות הון שותפים עצמאית מחשבונאות לקוח. ראה Section 4. |

### סדר יישום מאושר (נעול — 6 יולי 2026)

```
Business Review (E2E: Tamir ✅ | Oshrit ✅ | Liron & Alon ✅)
  → Business Freeze (הצהרה של יוסי)
    → PREREQ-1 (review_status column)
      → Approved Data Fixes (SA-003, SA-005, SA-006, Q2, Q7)
        → Task 4 G1–G5 PASS
          → Task 5
```

> ⚠️ **אסור להתחיל PREREQ-1 לפני Business Freeze.** כל שינוי בנתונים חסום עד אז.

### SA-004 — עדכון מסגרת (6 יולי 2026)

SA-004 אינו עוד "באג סיווג" (reversed BPO).  
מסקנה מבדיקת Tamir ו-Liron & Alon: **SA-004 מייצג דפוס קיזוז בין-נכסי (cross-property settlement).**  
RC1: נשאר Needs Review — ללא תיקון אוטומטי.  
RC2: ישוב במסגרת מנוע הסדרי הקיזוז.

### SA-006 — שיטת תיקון מאושרת

**לא** למחוק שורות. במקום:
```sql
UPDATE transactions
SET review_status = 'confirmed_duplicate'
WHERE property_name = 'Tamir dekelia'   -- lowercase
  AND date = '2026-04-30'
  AND subcategory IN ('Platform Income', 'Cleaning', 'Management Fee')
  AND payer = 'JJ';
```
פעולה זו מחייבת שעמודת `review_status` קיימת תחילה.

**סטטוס SA-006: COMPLETE ✅** — כל 3 השורות סומנו `confirmed_duplicate` (נאמת 8 יולי 2026).

---

### SA-019 — Oshrit Deklia, Management Fee, 2026-01-01 (נוסף 8 יולי 2026)

**גילוי:** נמצא בעת בדיקת PREREQ-1 — שורה רביעית עם `review_status = 'confirmed_duplicate'`, שאינה חלק מ-SA-006.

| שדה | ערך |
|-----|-----|
| ID | `9a11e677-7b0e-44e3-bddd-5b68c0e9c9a4` |
| Date | 2026-01-01 |
| Property | Oshrit Deklia |
| Category | Management |
| Subcategory | Management Fee |
| Payer → Payee | Owner → JJ |
| amount_eur | **€0.00** |
| client_charge | €1,000.00 |
| Created | 2026-06-09 |
| review_status | `confirmed_duplicate` |

**מאפיין:** שורה עם `amount_eur = 0` ו-`client_charge = 1,000`. הסכום נרשם בשדה הלא-נכון. סומנה `confirmed_duplicate` — ככל הנראה קיימת שורת Management Fee תקפה לאותו נכס ותאריך.

**פעולה נדרשת:** אין. השורה כבר מסומנת נכון. אין למחוק.

### System Alerts — קבצים

| קובץ | תיאור |
|------|-------|
| `system_alerts_rc1.xlsx` | דוח כל ה-Alerts — 21 alerts, 4 גיליונות (עודכן 6 יולי 2026) |

---

### RC3.1 Data Quality Backlog (נוסף 8 יולי 2026)

> ⚠️ הממצאים הבאים אינם חוסמים את RC3.1 אך חייבים להיות מטופלים לפני שמנוע הדוחות ייפרס לייצור.

**1. שורות עם `property_name = NULL` — 391 שורות**
- 391 שורות אינן משויכות לנכס כלשהו.
- מנוע הדוחות של RC3 מסווג לפי `property_name`. שורות NULL יהיו בלתי-נראות לכל דוח ממוקד-נכס.
- פעולה נדרשת לפני ייצור: לזהות ולשייך שורות NULL לנכסים, או לתעד את הסיבה לחיסרון.
- **לא לשנות נתונים עד אישור מפורש.**

**2. וריאנטים של `property_name` — אותו נכס, שמות שונים**
- ה-DB מכיל 55 ערכים ייחודיים של `property_name`, חלקם כפילויות בשל הבדלי אותיות גדולות/קטנות או שגיאות כתיב:

| שם ראשי | וריאנט | שורות (וריאנט) |
|---------|--------|---------------|
| Tamir Dekelia | Tamir dekelia | 4 |
| JJ Ground Floor Dekeleia | jj ground floor Dekeleia | 6 |
| Villa Mazotos 2 | Villa mazotos 2 | 5 |
| Tom Dekelia | Tom dekelia | 2 |
| Ofri Makarios 5 Floor | Ofri makarios 5 Floor | 1 |
| Liora Anafotia 202 | Liora anafotia 202 | 1 |
| Orit Rob Pingodes | Orit Rob pingodes | 1 |
| Tamir Kiti 2 | Tamir kiti 2 | 1 |
| Yogev Port | yogev port | 1 |

- וריאנטים אלו יגרמו לפיצול חשבונות בדוחות RC3 — כל וריאנט ייראה כנכס נפרד.
- פעולה נדרשת לפני ייצור: איחוד שמות (UPDATE transactions SET property_name = ...) או נרמול בשכבת הView.
- **לא לשנות נתונים עד אישור מפורש.**

---

## 13.5 North Star — מסמך חוקתי (10 יולי 2026)

`JJ_NORTH_STAR.md` (v1.1) אושר ע"י יוסי כמסמך חוקתי: **חזון SaaS ERP לחברות ניהול נכסים, עקרון Tenant-Neutral, שלושה עמודי תווך (Identity / Business / Operations), 10 עקרונות ארכיטקטוניים.** כל ADR/מודול/החלטה ארכיטקטונית חייבים להוכיח אי-סתירה מולו. המיילסטון הבא: **M0 Operational Readiness** (`OPERATIONAL_READINESS_DESIGN.md`) לפי המתודולוגיה: Design Review → ADR → Architecture Review → QA Gates → מימוש. Gap analysis: `SAAS_GAP_ANALYSIS.md` (תיקוני D1 בתוך M0).

## 13.6 ADR-001 — Canonical Knowledge Authority (13 יולי 2026)


`ADR-001_CANONICAL_KNOWLEDGE_AUTHORITY.md` אושר כמסמך חוקתי (אותה רמה כ-North Star).

**החלטה:** JJ מחזיק מקור אמת אחד ויחיד לידע עסקי היסטורי — **JJ Historical Knowledge Authority (JHKA)**. כל סוכן AI צורך ידע מ-JHKA. אף סוכן לא מגדיר מחדש היסטוריה עסקית באופן עצמאי.

**ארכיטקטורה:** חלוקה לפי דומיין עסקי (לא לפי סוג מקור): Property Lifecycle, Financial, Client Relationship, Operational, Business Rules, Knowledge Validation.

**שלבי יישום:** (1) Skill בתוך Claude Project — עכשיו; (2) ניקוי והזנת היסטוריה; (3) מיגרציה ל-Knowledge Base מרכזי ב-Supabase; (4) כל הסוכנים צורכים מ-KB.

**עקרון מפתח:** JHKA חוקר, מסביר, ממליץ, ומחכה לאישור. לעולם לא משנה נתונים עסקיים באופן עצמאי.

### JHKA Organizational Knowledge Foundation

JHKA's canonical mission, architecture, principles, execution phases, and knowledge model are maintained in:

`JHKA_ORGANIZATIONAL_KNOWLEDGE_FOUNDATION_v1.0.md`

This document is the authoritative specification for the Organizational Memory of JJ Property 10.

Any work related to JHKA, historical knowledge, organizational memory, evidence management, Decision Batches, or future knowledge architecture MUST begin by reviewing this document.

`CLAUDE.md` intentionally contains only a reference to avoid duplication.

---

## 13.6b ADR-002 — Partner Entry Model (21 יולי 2026)

`ADR-002_PARTNER_ENTRY_MODEL.md` אושר כמסמך חוקתי — דרגה #2 מבין 3 ADRים ייסודיים (Property Identity / **Partner Entry Model** / Accounting Engine RC3).

**שישה מושגים מוגדרים לצמיתות:**
1. **Historical Purchase Price** — מחיר הרכישה. לעולם לא משתנה.
2. **Entry Valuation** — השווי שבו נכנס משקיע חדש. לא משפיע על מחיר הרכישה.
3. **Historical Component** = Historical Price × Ownership % → למוכר.
4. **Valuation Premium** = (Entry Valuation − Historical Price) × Ownership % → לשותפים קיימים.
5. **Settlement Distribution** — למי הגיע הפרמיה, מאיזה טרנזקציה, למה. **החוליה החסרה הקריטית כיום.**
6. **Ownership History** — כל שינוי בבעלות מתועד כרונולוגית. סכום = 100% תמיד.

**עיקרון חוקתי:** Every euro belonging to an investor must be explainable by evidence. שרשרת: Agreement → Partner Entry → Settlement Distribution → Capital Events → Transactions → Reports.

**ארבע שכבות סיווג (מוסף 21 יולי 2026):**
1. **Transaction Evidence** — מה שקרה לפי הבנק/טרנזקציות
2. **Business Decision** — החלטה עסקית מאושרת ע"י יוסי, מסבירה למה הסיווג כפי שהוא (מתועדת ב-JHKA)
3. **Economic Distribution** — החלוקה הכלכלית הסופית לפי ההסכם
4. **Accounting Outcome** — המספרים שמופיעים בדוחות וחשבונות ההון

**Transaction Evidence ≠ Economic Distribution** — ידיעה שכסף עבר מ-A ל-B לא מוכיחה ש-B שמר את הכול. Business Decision הוא החוליה שמקשרת ביניהם.

**Schema:** `lifecycle.partner_entry` כבר מחזיקה את השדות הנדרשים. מה שחסר: טבלת `settlement_distribution` (scope: migration עתידי, אחרי סגירת D-1, D-7, D-8, VM2-Q1–Q3).

**Schema:** `lifecycle.partner_entry` כבר מחזיקה את השדות הנדרשים. מה שחסר: טבלת `settlement_distribution` (scope: migration עתידי).

---

## 13.6c ADR-003 — Decision Access Layer (22 יולי 2026)

`ADR-003_DECISION_ACCESS_LAYER.md` אושר כמסמך חוקתי — דרגה #4 מבין 4 ADRים ייסודיים (Property Identity / Partner Entry Model / Accounting Engine RC3 / **Decision Access Layer**).

**החלטה:** JJ מאמץ את ה-Decision Access Layer (DAL) כשכבת ההרשאות החוקתית של כל המשרד הדיגיטלי. DAL מחליט מי רשאי לראות, לאשר, ולבצע כל החלטה במערכת.

**חמישה ממדי גישה (Access Dimensions):**
1. **Awareness** — יודע שהחלטה קיימת, בלי לראות תוכן.
2. **View** — רואה את ההחלטה וההמלצה.
3. **Evidence** — רואה את הראיות והמקורות (נפרד מ-View).
4. **Approve** — רשאי לאשר או לדחות.
5. **Execute** — רשאי לבצע את הפעולה שאושרה.

**חוק ראשון:** Executives classify. DAL authorizes. — ה-Executive מצהיר על רגישות ודומיין; ה-DAL מכריע מי רשאי לראות.

**שמונה עקרונות חוקתיים (DAL-1…DAL-8):**
- DAL-1: Executives classify. DAL authorizes.
- DAL-2: Access is multi-dimensional, never simple read/write.
- DAL-3: Decision access and evidence access are separate.
- DAL-4: Approval and execution must remain separable.
- DAL-5: No Executive may grant access to its own output.
- DAL-6: Enforcement occurs at the lowest reliable layer.
- DAL-7: Every access decision must be explainable and auditable.
- DAL-8: Access decisions are business decisions, not technical decisions.

**DAL v0.1 Scope (OD-6 closed, 22 יולי 2026):** מינימום חוקתי ל-M0 — (1) authenticate principal, (2) resolve business scope, (3) evaluate Awareness+View only, (4) return auditable access result. ללא Evidence redaction, ללא Approve/Execute, ללא policy engine מורכב.

**M0 Status:** MERGED ✅ (PR #69, 22 יולי 2026). DAL v0.1 + M0 Chief of Staff MVP על main. `NEEDS_CEO_ROLE_CONTRACT` נשאר פתוח — `superadmin` הוא proxy זמני עד ש-`jj_staff_config` יהיה ב-production.

**שלבי יישום:** (1) ADR חוקתי — הושלם; (2) TypeScript types + evaluation function; (3) Governance policies; (4) שילוב עם Chief of Staff (M0 unfreeze); (5) ספיגת partnerAuthService policy; (6) כל Executive עתידי.

---

## 13.7 M8 Investment Lifecycle — סיכום (CLOSED ✅ 13 יולי 2026)

### Lifecycle Schema — מה נבנה

סכמת `lifecycle` מכילה 7 טבלאות, 3 views, RLS deny-all על כולן, 3 migrations:

| Migration | תוכן |
|-----------|------|
| `m8_lifecycle_001_schema` | 7 טבלאות + indexes + constraints |
| `m8_lifecycle_002_rls_and_views` | RLS + 3 views (partner / internal / active-events) |
| `m8_lifecycle_003_nullable_dates` | effective_from/date nullable + date_confidence column |

**Views:**
| View | קהל | JJ fields? |
|------|-----|-----------|
| `v_partner_investment_statement` | משקיע | ❌ אין |
| `v_jj_lifecycle_internal` | JJ admin בלבד | ✅ כולל jj_margin, jj_cost_basis |
| `v_lifecycle_active_events` | JJ admin | metadata בלבד |

### Business Validation — תוצאות (13 יולי 2026)

| Case | Property | Partner | capital_paid | capital_remaining | entry_status |
|------|----------|---------|-------------|-------------------|-------------|
| Case 1 | Villa Mazotos | Avi | €250,000 | €0 | fully_paid |
| Case 2 | Villa Mazotos 2 | Oren | NULL | NULL | capital_unknown |

`public.transactions` = 2,154 — לא השתנה.

### 9 עקרונות חוקתיים (P-ARCH-1 … P-ARCH-9)

ראה `M8_CONSTITUTIONAL_PRINCIPLES.md` — כל עיקרון עם דוגמה אמיתית מ-M8.

תמצית:

| עיקרון | כלל מרכזי |
|--------|-----------|
| P-ARCH-1 | Unknown = NULL. לעולם לא 0 או placeholder |
| P-ARCH-2 | Yossi ≠ Jacob ≠ JJ — זהות המשלם לא ניתנת לנרמול |
| P-ARCH-3 | אירוע אחד בעולם = רשומה אחת בסכמה = projections מרובים |
| P-ARCH-4 | Void-and-replace. אסור DELETE על רשומות מאושרות |
| P-ARCH-5 | lifecycle schema מבודד. אין FK ל-public |
| P-ARCH-6 | v_partner_investment_statement לעולם לא חושפת jj_* |
| P-ARCH-7 | Business Validation לפני UI / Timeline / PDF |
| P-ARCH-8 | JHKA הוא מקור האמת ההיסטורי |
| P-ARCH-9 | עובדות עסקיות בלתי ניתנות לשינוי. הבנה עסקית מתפתחת |

### Business Intelligence Layer — ארכיטקטורה (Proposed M9+)

```
Lifecycle → Ownership → Accounting → Settlement → Portfolio → Reporting → Business Intelligence
```

ה-BI Layer לא מחזיק עובדות. הוא רק שואל שאלות ונגזר מהמנועים שמתחתיו. ראה `M8_RETROSPECTIVE.md` Section 7.

---

## 13.8 M9-D — Verification Task Architecture (אושר 13 יולי 2026)

### הפרדת שכבות: מצב נתון מול מצב עבודה

```
date_confidence = 'pending_verification'  ←  DATA STATE   (שדה על ownership_period / capital_event)
lifecycle.verification_tasks              ←  WORK STATE   (שורה בטבלת תור העבודה)
```

שתי שכבות עצמאיות. NULL אחד מייצר task אחד. הן מתפתחות באופן עצמאי.

### החלטות ארכיטקטוניות (Yossi, 13 יולי 2026)

| החלטה | בחירה | נימוק |
|-------|-------|-------|
| מיקום | `lifecycle.verification_tasks` | Tasks נולדים מ-lifecycle facts — לא קיימים בפני עצמם |
| יצירה | `generate_verification_tasks()` — on demand | Model עדיין מתייצב — לא trigger אוטומטי |
| M10+ | Trigger אוטומטי | רק אחרי שהמודל יציב |
| `reason` | שדה נפרד | missing_date ≠ conflicting_sources — שתי בעיות, שני מסלולי פתרון |
| `proposed_value_json` | JSONB | גמישות לעתיד: date / amount / {date+confidence} / {partner+amount} |
| `search_strategy` | JSONB עשיר `[{order, source, match}]` | JHKA יודע לא רק היכן אלא גם איך לחפש |

### מבנה `search_strategy` — דוגמה לAvi entry date

```json
[
  {"order": 1, "source": "financial_documents", "match": "partnership agreement Villa Mazotos"},
  {"order": 2, "source": "email",               "match": "Avi Villa Mazotos"},
  {"order": 3, "source": "whatsapp",            "match": "Avi partnership"},
  {"order": 4, "source": "google_drive",        "match": "Villa Mazotos agreement"},
  {"order": 5, "source": "manual_upload",       "match": null}
]
```

### זרימת עבודה מלאה

```
NULL + pending_verification
    ↓
generate_verification_tasks()
    ↓
verification_task (status='pending', priority='high')
    ↓
JHKA מחפש לפי search_strategy
    ↓ ראיה נמצאה
status='evidence_found'
proposed_value_json={"date":"2023-08-15"}
evidence_source='financial_documents'
    ↓ יוסי מאשר
UPDATE lifecycle.ownership_period
  SET effective_from='2023-08-15', effective_from_confidence='confirmed'
UPDATE lifecycle.verification_tasks
  SET status='confirmed', confirmed_by='Yossi', confirmed_at=now()
```

### עדיפויות

| מצב | עדיפות | סיבה |
|-----|--------|-------|
| `capital_payment` = NULL לחלוטין (Oren) | HIGH | capital_remaining = NULL בדוח המשקיע |
| `effective_from` = NULL (תאריך כניסה) | HIGH | Investment Timeline לא מתפקד בלי זה |
| `effective_date` של תשלום ספציפי | MEDIUM | Timeline חלקי עדיין אפשרי |
| שדות עזר (מספר מסמך, ref נוטריון) | LOW | Audit trail בלבד — לא חוסם חישוב |

### קובץ

`m9_d_verification_tasks.sql` — CREATE TABLE + RLS deny-all + indexes + `generate_verification_tasks()` stored procedure.

---

## 13.9 FR-001 — Single Component Ownership (אושר 16 יולי 2026)

**כלל ארכיטקטוני — Frontend UI Components — תקף לכל מודול ב-JJ**

> Dashboard · AI Center · Calendar · CRM · Mobile · Design System · Reports · Partner Report

```
Every reusable component has exactly one source of truth.
Components are created once, merged once, and reused everywhere.
Future PRs may extend or consume a component, but never duplicate or replace its ownership.
```

### כללים מחייבים

| כלל | פירוט |
|-----|-------|
| **PR אחד = בעלות אחת** | PR שיצר רכיב הוא הבעלים הבלעדי שלו עד ה-merge |
| **אחרי merge → קריאה בלבד** | PRים עתידיים מייבאים מ-main — לא מעתיקים, לא יוצרים מחדש |
| **אסור inline** | אסור להחליף DS component בסימון inline בדף. No One-Off UI |
| **אסור duplicate ownership** | שני PRים פתוחים לא יכולים להחזיק את אותו קובץ |
| **אסור "adoption"** | PR לא יכול "לאמץ" רכיב שנוצר ב-PR אחר רק כי נוח לו |

### גבולות ב-Partner Report Story

| רכיב | PR בעלים | מצב |
|------|----------|-----|
| HealthSignal | PR-R1 | merged ✅ |
| WelcomeHeader, ExecutiveSummary | PR-R1 | merged ✅ |
| PropertyHealth, BusinessStory | PR-R2 | merged ✅ |
| IncomeTable, ExpenseTable | PR-R3 (PR #58) | ready for merge ✅ |
| DailyGreeting, AllClearCard | PR #55 (E3-A1) | merged ✅ |
| HighlightTimeline, SettlementCard | R4 | pending (after PR #55 merged) |
| NeedsAttentionItems | R4 | pending (after PR #55 merged) |

**הסיבה:** כפילות בעלות על רכיבים גרמה לקונפליקטים ב-ds/index.ts בכל squash merge. FR-001 מונע חזרה על הדפוס הזה לצמיתות.

---

## 13.10 FR-002 — Never Assume Merge State (אושר 16 יולי 2026)

**כלל תהליך — תקף לכל PR בכל מודול**

> Never assume merge state. Always verify main before starting the next PR.

לפני כל branch חדש, Claude חייב לאמת ש-main מכיל את כל ה-prerequisites:

```
1. קרא את HEAD SHA של main מה-API
2. ודא שה-merge SHAs של כל ה-PRים הנדרשים נמצאים ב-main
3. ודא שהקבצים הנדרשים קיימים על main (לא רק שה-PR נפתח)
4. רק אז צור את ה-branch החדש מ-main
```

**למה זה חשוב:** Squash merge, Rebase, CI failure לאחר merge, או merge שבוצע ב-wrong order — כולם יכולים לגרום לכך ש-branch חדש מתבסס על קוד חסר בלי שאף אחד שם לב.

**יישום:** `push_r4.py` (ו-כל push script עתידי) מריץ pre-flight check לפני יצירת ה-branch:
- מאמת שהקבצים שנוצרו ב-PRים הקודמים קיימים ב-main
- מדפיס ABORT אם משהו חסר
- ממשיך רק אחרי אימות מלא

---

## 13.11 Design Audit Gate — Release Gate רשמי (אושר 16 יולי 2026)

**שער שחרור חובה לאחר R4, לפני כל מודול חדש**

> ⛔ אסור להתחיל CRM / Calendar / Mobile / AI Center / Staff Portal / Owner Portal לפני שה-Gate עבר.

### תנאי ה-Gate

כל השאלות חייבות לקבל תשובה ✅ לפני פתיחת מודול חדש:

| שאלה | קריטריון |
|------|---------|
| אחידות ויזואלית | כל המסכים נראים כאילו יצאו מאותו מוצר |
| שפת צבע | צבעים, ריווחים וטיפוגרפיה אחידים בכל מסך |
| Design System | 13 כללי DS מיושמים בכל רכיב — אין One-Off UI |
| מבחן 5 שניות | לקוח חדש מבין מה המסך עושה תוך 5 שניות |
| שפת לקוח | שפה פשוטה וברורה — אין מינוח טכני או חשבונאי |

### מה עושים ב-Audit

1. Screenshots של כל המסכים הקיימים זה לצד זה
2. בדיקת עקביות: header, spacing, typography, color, component usage
3. רשימת תיקונים ממוספרת
4. PR ייעודי לתיקוני audit — קטן, ממוקד, ללא features חדשות
5. אחרי merge של תיקוני audit → Gate עבר → מודולים חדשים מותרים

### סדר ביצוע נעול (עודכן 27 יולי 2026)

```
R4 merged ✅
    ↓
JJ Design System v1.0 LOCKED ✅ (26 יולי 2026)
    ↓
Foundation Freeze PASS ✅ (26 יולי 2026)
    ↓
NAV-1 Architecture COMPLETE ✅ (27 יולי 2026)
  Phase 1: Vision + IA LOCKED
  Phase 2: Navigation Contract v1.1 LOCKED
  Phase 3: Component Contracts v1.2 LOCKED (amended 28/7)
  Phase 4: Composition Rules v1.0 LOCKED
  Implementation Gates v1.1 APPROVED
    ↓
NAV-1 PR #78 — OperatingFrame + Home Slice MERGED ✅ (28 יולי 2026) — Reference Case #1
    ↓
PR #79 — Home Workspace Completion MERGED ✅ (28 יולי 2026) — Reference Case #2
    ↓
PR #80 — Owner Entity Context MERGED ✅ (28 יולי 2026) — Reference Case #3
    ↓
PR #83 — CEO Workspace (RC-004) MERGED ✅ (29 יולי 2026) — Reference Case #4
    ↓
Screen Alignment (Finance → PageShell) — CLOSED ✅ (PR #81, 28 יולי 2026)
    ↓
Final Design Audit Gate ← CURRENT
    ↓
Owner Workspace P0 Architecture LOCKED ✅ (7 אוגוסט 2026)
    ↓
CRM → Calendar → Owner Portal → AI Center → Mobile
```

> **כלל מנחה (אושר 27 יולי 2026):** המסמך הבא ייכתב רק אם המימוש יחשוף פער אמיתי. אין ליצור Governance נוסף "ליתר ביטחון". אם המסגרת הקיימת מספיקה — זו הוכחה שהארכיטקטורה נכונה.

> **JJ Development Principle (אושר 27 יולי 2026):**
> Architecture precedes the first implementation.
> After the architecture is locked, code becomes the primary source of learning.
> New governance is created only when implementation reveals a real architectural gap.
> Otherwise, the existing constitutional chain remains the source of truth.
>
> Companion axiom: *Architecture without implementation is only a hypothesis.*

---

## 13.16 JJ Design System v1.0 — LOCKED ✅ (26 יולי 2026)

`JJ_DESIGN_SYSTEM_V1.0.md` אושר ונעול ע"י יוסי כמסמך חוקתי — מסמך חוקתי #5 (אותה רמה כ-North Star, ADR-001, ADR-002, ADR-003).

**מה המסמך מגדיר:**
- **Part 0 — Experience Identity:** 6 עקרונות מייסדים (EX-1…EX-6). Anxiety Elimination, Silence > Noise, Every Number Explains Itself, Unknown ≠ Zero, The User Is Not an Accountant, One Product One Voice.
- **Part 1 — Audit Evidence Register:** 8 ממצאים מסווגים. COMP-1/COMP-2 = SYNC (לא product defect). 0 PRODUCT defects.
- **Part 2 — Foundations:** Typography (9 tokens), Spacing (5+4), Radius (4 tiers), Elevation (3), Colors (4 surfaces + 4 statuses + 5 text + 3 borders), Content Width (4), Grid, Breakpoints, Motion, RTL, A11y, **Semantic Token Layer** (24 tokens — Tailwind הוא מימוש, לא API).
- **Part 3 — Information Hierarchy:** 6-Level standard (Identity→Status→Actions→Summary→Detail→Evidence).
- **Part 4 — Component Contracts:** 17 components עם purpose, variants, states, forbidden usage.
- **Part 5 — AI Experience Contract:** AI never calculates. AI always attributed. deterministic narrative ≠ AI narrative.
- **Part 6 — Screen Migration Matrix:** 4 COMPLIANT, 1 NEEDS_ALIGNMENT (Finance), 1 REQUIRES_PRODUCT_DECISION (CEO Dashboard → **Option D: CEO Workspace** נבחר).
- **Part 7 — Module Readiness:** Owner Portal READY. Financial Docs NEEDS_FOUNDATION. CRM/Calendar/Mobile/AI Center/Staff Portal BLOCKED on NAV-1.
- **Part 8 — Release Gates:** 4 gates (DS Lock → NAV-1 → Screen Alignment → Final Audit).

**CEO Dashboard — Option D (נבחר ע"י יוסי 26 יולי 2026):**
Home = "What needs me today?" (personal daily brief, anxiety elimination).
CEO Workspace = מרכז פיקוד תפעולי (cashboxes, P&L, company health, staff, alerts).
**זה לא Dashboard — זה Workspace.** מיושם אחרי NAV-1.

**Governance:**
- כל PR שמשנה UI חייב להצביע על ה-DS component או token שהוא מממש.
- סטייה מהמסמך דורשת: (1) שימוש ברכיב קיים, או (2) הצעת amendment + אישור יוסי לפני מימוש.
- המסמך הוא המקור. הקוד הוא המימוש — לא להפך.

**UI Governance Rule (אושר 26 יולי 2026):**
> No new UI component may be introduced unless:
> 1. It is implemented from the Design System, or
> 2. A documented proposal updates JJ Design System v1.0 before implementation.
>
> The Design System is the authority. Application code is its implementation.

**הבא:** Foundation Freeze → NAV-1 — Global App Shell. לא מורשה להתחיל ללא Gate נפרד.

---

## 13.17 Constitutional Registry — JJ Design Foundation (26 יולי 2026)

**אבן דרך:** 🟢 **JJ Design Foundation — LOCKED**

תשעה מסמכים חוקתיים מגדירים את JJ. כל מודול, ADR, או PR חייב להוכיח תאימות לכולם:

| # | מסמך | קובץ | שאלה שהוא עונה עליה | תאריך נעילה |
|---|------|------|---------------------|-------------|
| 1 | **North Star (Manifesto)** | `JJ_NORTH_STAR.md` | למה JJ קיימת? | 10/7/2026 |
| 2 | **Product Constitution (P-ARCH-1…9)** | `M8_CONSTITUTIONAL_PRINCIPLES.md` | איך מתקבלות החלטות מוצר? | 13/7/2026 |
| 3 | **Experience Principles (EX-1…6)** | `JJ_DESIGN_SYSTEM_V1.0.md` Part 0 | איך המערכת צריכה להרגיש? | 26/7/2026 |
| 4 | **Responsibility Architecture** | `ADR-006_RESPONSIBILITY_ARCHITECTURE.md` | מי אחראי על מה? מה הגבולות? | 23/7/2026 |
| 5 | **Design System v1.0** | `JJ_DESIGN_SYSTEM_V1.0.md` Parts 1–8 | מה החוזה העיצובי המחייב? | 26/7/2026 |
| 6 | **Navigation Principles v1.0** | `JJ_NAV_PRINCIPLES.md` | מה עקרונות הניווט המחייבים? | 27/7/2026 |
| 7 | **Navigation Contract v1.1** | `NAV-1_PHASE2_NAVIGATION_CONTRACT.md` | מה החוזה בין Frame, Workspace ו-Module? | 27/7/2026 |
| 8 | **Component Contracts v1.1** | `NAV-1_PHASE3_COMPONENT_CONTRACTS.md` | מה החוזה של כל רכיב ארכיטקטוני? | 27/7/2026 |
| 9 | **Capability Architecture v1.0** | `JJ_CAPABILITY_ARCHITECTURE_V1.md` | מה JJ יודעת לעשות? באיזו בשלות? | 28/7/2026 |

**מסמכי ADR נוספים (ארכיטקטורה פנימית):**

| # | מסמך | קובץ |
|---|------|------|
| 6 | ADR-001 Canonical Knowledge Authority | `ADR-001_CANONICAL_KNOWLEDGE_AUTHORITY.md` |
| 7 | ADR-002 Partner Entry Model | `ADR-002_PARTNER_ENTRY_MODEL.md` |
| 8 | ADR-003 Decision Access Layer | `ADR-003_DECISION_ACCESS_LAYER.md` |
| 9 | ADR-004 Executive Decision Cycle | `ADR-004_EXECUTIVE_DECISION_CYCLE.md` |
| 10 | ADR-005 Decision Lifecycle | `ADR-005_DECISION_LIFECYCLE.md` |
| 11 | CFO Constitution | `CFO_CONSTITUTION.md` |
| 12 | JHKA Foundation | `JHKA_ORGANIZATIONAL_KNOWLEDGE_FOUNDATION_v1.0.md` |

### Foundation Freeze — Cross-Reference Audit (26 יולי 2026)

| בדיקה | תוצאה |
|-------|--------|
| North Star ↔ ADR-006 | ✅ ADR-006 מפנה ל-North Star (3 Pillars). North Star נכתב לפני ADR-006 — אין הפניה חזרה (תקין) |
| North Star ↔ DS v1.0 | ⚠️ North Star לא מפנה ל-DS (נכתב לפני). DS לא מפנה ל-North Star ישירות — מפנה ל-P-ARCH-1 |
| P-ARCH ↔ DS v1.0 | ✅ DS v1.0 מפנה ל-P-ARCH-1, P-ARCH-6. EX-4 מבוסס על P-ARCH-1. תאימות מלאה |
| P-ARCH ↔ ADR-006 | ✅ ADR-006 Responsibility Model תואם P-ARCH-2 (Partner Capital), P-ARCH-3 (One Canonical Event) |
| ADR-006 ↔ DS v1.0 | ⚠️ ADR-006 לא מפנה ל-DS (שניהם נעולו באותו שבוע). DS לא מפנה ל-ADR-006 |
| ADR-001/002/003 ↔ ADR-006 | ✅ ADR-006 Section 11 מפנה לכל שלושתם |
| סתירות | ✅ **אפס סתירות** — המסמכים מכסים דומיינים שונים ומשלימים זה את זה |
| Gates | ✅ כל ה-Gates עדכניים (DS Lock ✅, NAV-1 pending, Screen Alignment pending, Final Audit pending) |
| הוראות Claude | ✅ 23 הוראות — משקפות את כל המסמכים החוקתיים |

**ממצא ⚠️ — הפניות חסרות (לא סתירות):**
- North Star ו-DS v1.0 לא מפנים זה לזה ישירות — אין סתירה, אבל אין קישור מפורש. DS נולד מאותה פילוסופיה אבל לא מצהיר על זה. **אין צורך בתיקון** — המסמכים עצמאיים בכוונה.
- ADR-006 ו-DS v1.0 לא מפנים זה לזה — שניהם נעולו באותו שבוע. **אין צורך בתיקון** — ADR-006 מכסה ארכיטקטורה, DS מכסה עיצוב.

**פסק דין:** Foundation Freeze — **PASS ✅**. אפס סתירות. הפניות חסרות הן natural gap (מסמכים שנכתבו בזמנים שונים), לא כשל.

---

## 13.14 Finance Knowledge Graph — PR #70 (Production Certified ✅ 23 יולי 2026)

### Gate Record

| Gate | Status | Date |
|------|--------|------|
| Migration Gate | ✅ Production Certified | 2026-07-23 |
| Architecture Review | ✅ PASS | 2026-07-23 |
| Product Review | ✅ PASS | 2026-07-23 |
| DNA Review | ✅ PASS | 2026-07-23 |

### מה הוכח

שרשרת Finance Knowledge Graph מלאה ופעילה בפרודקשן:

```
Evidence → Claim → Position → Decision → Explanation → Immutable Audit
```

| Layer | Implementation | Status |
|-------|---------------|--------|
| L1 — Evidence | `finance.evidence_links` (RLS deny-all, immutable after creation) | ✅ DB |
| L2 — Claim | `finance.claim_templates` + `evaluateClaim.ts` (pure, no stored state) | ✅ DB + Code |
| L3 — Position | `computeFinancialPosition.ts` (allPass gate, score informational) | ✅ Code |
| L4 — Decision | `evaluateDecision.ts` (pure) + `executeDecision()` Server Action | ✅ Code |
| L5 — Explanation | `buildDecisionExplanation.ts` (pure, never stored) | ✅ Code |
| L6 — Audit | `finance.decision_log` (IL-1: append-only trigger, UPDATE/DELETE rejected) | ✅ DB |

### Migration — finance schema

| Migration | SHA-256 | Status |
|-----------|---------|--------|
| `20260723_001_finance_schema.sql` | `9a2b2310c548a70d4b2800628e5edf55d2ca2a9e85adc35be6b9c796eb793d12` | ✅ Applied |

**Post-migration verification (25/25 PASS):** finance schema ✅, tables=4 ✅, triggers=2 ✅, templates=3 ✅, RLS=4 RESTRICTIVE ✅, transactions delta=0 ✅, IL-1 UPDATE rejected ✅, IL-1 DELETE rejected ✅, IL-4 UPDATE rejected ✅, IL-4 DELETE rejected ✅, anon denied ✅, authenticated denied ✅, schema isolation ✅.

### Claim Templates (approve_withdrawal)

| Claim ID | Statement | Expected State (Jacob/July 2026) |
|----------|-----------|----------------------------------|
| `cashbox_sufficient` | Partner cashbox balance is positive | SUPPORTED (+€56,479) |
| `no_open_corrections` | No open correction cases | SUPPORTED |
| `bank_reconciliation` | Bank statement attached and reconciled | UNSUPPORTED (no July 2026 import — expected) |

### Constitutional Rules Enforced

| Rule | Enforcement |
|------|-------------|
| KG-4: score.total is NEVER a decision gate | `allPass` boolean is the only gate in `computeFinancialPosition.ts` |
| IL-1: decision_log append-only | `trg_decision_log_immutable` BEFORE UPDATE OR DELETE |
| IL-4: position_score_deltas append-only | `trg_score_deltas_immutable` BEFORE UPDATE OR DELETE |
| ADR-005: only Executed decisions log | `logDecision()` only called after `executeDecision()` confirms allPass |
| Override hard-blocked | triple defense: UI=false, Server Action rejects, logDecision() throws |
| RC3 Data Boundary | Finance never reads `public.transactions` directly |

### RC2 Action Items (non-blocking)

| Item | Description |
|------|-------------|
| RC2-FINANCE-001 | Sync `EvidenceSourceType` ('ledger' in TS union) with `evidence_links` CHECK constraint |
| RC2-FINANCE-002 | Finance Glossary — canonical definitions for Evidence, Claim, Position, Decision |

ראה `RC2_ACTION_ITEMS.md`.

**אסור להתחיל RC2 ללא Gate חדש מאושר ע"י יוסי.**

---

## 14. הוראות לסוכן חדש

1. קרא קובץ זה תחילה
2. הסנדבוקס **חסום לאינטרנט** — אל תנסה requests/pip לסופאבייס
3. כל פעולה על הDB: צור SQL → תן למשתמש להריץ ב-SQL Editor, או Python script להרצה מקומית
4. כל ייבוא/עדכון CSV: עדכן checksums ב-`run_import_NOW.py`
5. הנכסים הם **property_name** בDB, לא `property`
6. **חוזה ≠ תשלום** — Purchase Contract / Sale Contract = ערכי עסקה בלבד
7. **אל תמחק שורות** — שנה `review_status` בלבד
8. **Cross-property settlements → RC2** — ב-RC1 אלו Needs Review בלבד
9. **Task 5 חסום** — לא להתחיל לפני אישור Task 4 G1–G5
10. **Internal Offset ≠ Duplicate** — תיאורים עם קיזוז / לסגור חוב / מהשכירות / לטובת השיפוץ הם עסקאות תקפות. שני דפוסים: (א) JJ Internal Settlement — JJ כ-payer/payee; (ב) External Personal Payment — Yossi/Jacob קיבלו אישית, קזז מחוב לקוח; שמור payer/payee כפי שנרשם. אל תסמן confirmed_duplicate. ראה Section 4.
11. **Partner Capital Rule** — Yossi ≠ Jacob ≠ JJ. אל תנרמל תשלומי שותפים לתוך JJ. שמור את ה-payer/payee המקורי בכל ייבוא, תיקון, או מיגרציה. גם עסקאות שאינן משפיעות על יתרת הלקוח קריטיות לגישור הון ברמת השותפים. ראה Section 4.
12. **JHKA הוא מקור האמת** — כל ידע עסקי היסטורי נמצא ב-JHKA בלבד. אל תיצור גרסה מקבילה של היסטוריה עסקית. ראה ADR-001, Section 13.6.
13. **FR-001 — Single Component Ownership** — כל רכיב UI שייך ל-PR אחד. אחרי merge: ייבוא בלבד, אין העתקה, אין inline. ראה Section 13.9.
14. **FR-002 — Never Assume Merge State** — לפני כל branch חדש: אמת שכל ה-prerequisites נמצאים ב-main דרך ה-API. אל תסתמך על זיכרון. ראה Section 13.10.
15. **Bridge v2 API** — השתמש תמיד ב-`claude_github_bridge.py` (v2.0 Stable, 16 יולי 2026). כל פרמטר required עובר דרך `_require()` — לעולם אין `cmd[...]` ישיר. Aliases: `sha`/`commit_sha`, `branch`/`ref`, `path`/`remote_path`, `message`/`commit_message`. הרץ `self_test` לאחר כל שינוי ב-Bridge. ראה `BRIDGE_V2_RELEASE_NOTES.md`.
16. **DAL — Decision Access Layer** — כל Digital Executive חייב להצהיר DecisionAccessDeclaration על כל output. אסור ל-Executive להעניק גישה ל-output שלו (DAL-5). הגישה מוערכת ע"י DAL לפי 5 ממדים (Awareness/View/Evidence/Approve/Execute). Enforcement בשכבה הנמוכה ביותר (DAL-6). ראה ADR-003, Section 13.6c.
17. **M0 Chief of Staff — MERGED ✅** — PR #69 (SHA `ff18329`) על main. DAL v0.1 פעיל. `NEEDS_CEO_ROLE_CONTRACT` פתוח — `superadmin` = proxy זמני. שינויים ב-providers/DAL policies דורשים אישור יוסי. אסור להוסיף business semantics חדשים ל-Executive Brief ללא אישור מפורש.
18. **Finance Knowledge Graph — PRODUCTION ✅** — PR #70 (SHA `2e7e34eb`) על main. `finance` schema פעיל: 4 טבלאות, 2 triggers (IL-1/IL-4), 3 Claim Templates, RLS deny-all RESTRICTIVE. שרשרת Evidence→Claim→Position→Decision→Explanation→Immutable Audit מוכחת. **אסור לגעת בארכיטקטורת Finance ללא Gate חדש מאושר.** אסור להתחיל RC2. RC2 Action Items ב-`RC2_ACTION_ITEMS.md`. ראה Section 13.14.
19. **Hostaway Property Audit Foundation — MERGED ✅** — PR #71 (SHA `0562e0ae`) על main. Read-only audit service + DTO contract v2. Period-aggregate matching (לא reservation-level). `isRevenueEligible()` = canonical rule (confirmed/modified בלבד). `AuthoritativeAmount` עם source/confidence. 86 tests. **אין UI, אין migrations, אין DB writes.** Consumers: CFO, Chief of Staff, Owner Workspace, PR #3 UI. ראה Section 13.15.
20. **ADR-006 Responsibility Architecture — G1 + G3-A + G3-B CLOSED ✅** — PR #73 (SHA `f00adf40`), PR #76 (SHA `d58f6dce`), PR #77 (SHA `bf43d10e`). G1: Owner Workspace unified behind `lifecycle.entity_identity` via `identityResolverService`. G3-A: Financial boundary via adapters. G3-B: Reservation boundary via `ownerReservationAdapter` + `ownerPortfolioAdapter`. R7 Foundation→Production. Active Boundary Conflicts: 2→1. **כלל עדכון מטריצה:** כל PR שמשנה responsibility חייב לעדכן את המטריצה או להצהיר "No responsibility change". G3-C (Owner Audit Composition) — DEFERRED.
21. **G3-B Owner Workspace Reservation + Portfolio Alignment — CLOSED ✅** — PR #77 (SHA `bf43d10e6c07f0085cdb77d26071e81cd4e435cb`) על main. `ownerWorkspaceService` delegates `getOwnerReservations` → `ownerReservationService` → `ownerReservationAdapter` → `PropertyAuditService`. `getHostawayPortfolio` → `ownerPortfolioAdapter` → `listAuditableProperties()`. אין `pms.*` reads בקוד הרצה. אין Local Revenue Arithmetic. Guest masking: checkOut < today → `[Guest]`; checkOut >= today → full name; null → null (P-ARCH-1). G3-17 ✅ (no PropertyAuditService import in service). G3-18 ✅ (no adapter-to-adapter imports). 7 files, CI PASS. Branch deleted. **G3-C DEFERRED.**
22. **G3-C — Owner Audit Composition Layer (DEFERRED — Design Constraints Pre-Approved, 26 יולי 2026):** ⚠️ אסור להתחיל G3-C ללא Gate מאושר ע"י יוסי. **עיקרון חוקתי שאושר לפני כל מימוש:** `Composition may aggregate authorities; it may never replace them.` — שכבת Composition רשאית לאחד מידע ממספר מקורות סמכות, אבל אסור לה להפוך בעצמה למקור סמכות חדש. **ארכיטקטורה מאושרת:** `Owner Workspace → OwnerAuditService → { Finance KG Provider | Statements Provider | Evidence Provider }`. `OwnerAuditService` הוא Composition Layer בלבד — אינו מחשב יתרות, אינו מסווג עסקאות, אינו מכריע פיננסית. Finance KG = מקור האמת לנתונים פיננסיים. Statements = מקור האמת להיסטוריית דוחות ו-Snapshots. Evidence = מקור האמת לשרשרת הראיות. שינוי בכל Provider = שינוי ב-Provider בלבד; `OwnerAuditService` וה-UI יישארו יציבים. **ה-Service לא ייקרא "Audit Engine" — ייקרא "Owner Audit Composition Layer"** כדי לשקף במדויק את האחריות שלו ולמנות זליגה של לוגיקה עסקית פנימה. **סדר מימוש מחייב:** G3-C מתחיל מ-Provider contracts ו-evidence availability — לא מכתיבת service או UI. Gate ראשון: הגדרת query interface + return types של כל Provider (Finance KG / Statements / Evidence). ה-DTO של `OwnerAuditService` נגזר מהם, לא להיפך.

**G3-C Gate 0 — Authority Contract Freeze (אושר 26 יולי 2026):** לפני שורת קוד אחת של `OwnerAuditService`, חייבים להיות מאושרים שלושה Contracts עצמאיים. **Phase 1:** כל Provider מגדיר באופן עצמאי את ה-interface שלו (request contract, response DTO, limitations, unavailable behavior, evidence guarantees) — ללא תלות ב-Owner Workspace. **Phase 2:** רק אחרי שכל שלושת ה-Contracts נעולים — מגדירים `OwnerAuditDTO`. כל שדה חייב לציין את ה-Provider שממנו הוא נגזר. אסור שיופיע שדה ללא מקור מפורש. **Phase 3:** רק עכשיו מותר לכתוב את `OwnerAuditService` — תפקידו orchestration, composition, limitation propagation, normalization בלבד. **אסור:** accounting, reconciliation, evidence generation, statement calculation, financial inference. **עיקרון חוקתי:** `Authority contracts precede composition contracts. Composition contracts precede composition services.`
23. **JJ Design System v1.0 — LOCKED ✅** — מסמך חוקתי #5 (`JJ_DESIGN_SYSTEM_V1.0.md`, 26 יולי 2026). כל PR שמשנה UI חייב להצביע על ה-DS component או token שהוא מממש. סטייה מהמסמך דורשת: (1) שימוש ברכיב קיים, או (2) הצעת amendment + אישור יוסי. המסמך הוא המקור — הקוד הוא המימוש, לא להפך. Semantic Token Layer: tokens הם ה-API, Tailwind הוא המימוש. CEO Dashboard → Option D (CEO Workspace). NAV-1 הבא — לא מורשה ללא Gate נפרד. ראה Section 13.16.
24. **NAV-1 Navigation Architecture — Phase 1+2+3+4 LOCKED ✅** — מסמכים חוקתיים #6, #7, #8 (27 יולי 2026). Phase 1 (`NAV-1_PHASE1_VISION_AND_IA.md`): Vision, Responsibility Map, Sidebar Reconciliation, ~6 navigation items, Option A (Responsibility-Based). Phase 2 (`NAV-1_PHASE2_NAVIGATION_CONTRACT.md`): 5 contracts (A–E) + Workspace Registry + Cross-Contract Rules. Phase 3 v1.1 (`NAV-1_PHASE3_COMPONENT_CONTRACTS.md`): 7 Component Contracts (Constitutional First), Responsibility Chain, Containment Map. Phase 4 (`NAV-1_PHASE4_COMPOSITION_RULES.md`): 2 Valid Layout Trees, 7 Containment Rules, 9 Forbidden Combinations, 5 Invariants. Navigation Principles (`JJ_NAV_PRINCIPLES.md`): 10 עקרונות. Implementation Gates v1.1 (`NAV-1_IMPLEMENTATION_GATES.md`): 5 gates (0–4) + Amendment Rule. **כלל מחייב:** שינוי בניווט = Amendment + אישור יוסי. Workspace חדש = Nav Principle 9 (ADR/constitutional amendment). **Implementation: PR #78 MERGED ✅ (28 יולי 2026, Merge SHA: `5bf79584`). First validated vertical slice: OperatingFrame + Home Slice. Amendment approved: `<main>` delegation (Phase 3 → v1.2). Gates 0–4 ALL PASS. Branch DELETED.**
25. **NAV-1 Phase 3 Component Contracts — LOCKED ✅** — מסמך חוקתי #8 (`NAV-1_PHASE3_COMPONENT_CONTRACTS.md`, v1.2, amended 28 יולי 2026). 7 רכיבים ארכיטקטוניים: OperatingFrame (FROZEN), WorkspaceShell (FROZEN), PageShell (STABLE), TabNav (STABLE), GlobalContextProvider (FROZEN), AttentionLayer (STABLE), WorkspaceHeader (STABLE). Responsibility Chain invariant: "No component produces Business Truth." Containment Map: mutual exclusion (WorkspaceShell XOR PageShell). Stability tiers: FROZEN (constitutional amendment) / STABLE (ADR). **כלל מחייב:** כל PR שנוגע ברכיב ארכיטקטוני חייב לציין את ה-Component Contract שהוא ממלא. סטייה = Amendment + אישור יוסי. ראה Section 13.17.
28. **JJ Capability Architecture v1.0 — APPROVED ✅ (28 יולי 2026):** מסמך חוקתי #9 (`JJ_CAPABILITY_ARCHITECTURE_V1.md`). מגדיר את כל 24 יכולות JJ ב-3 שכבות (Foundation/Business/Intelligence), עם 9-field contracts לכל Capability (כולל Boundary + Owner). שני מודלי בשלות: Maturity (0–4) + AI Autonomy (A0–A4). Production Gate (8 exit criteria). Capability Lifecycle (Business Problem → Evolution). Evidence Index (כל בשלות נתמכת בראיה). מצב נוכחי: 7/24 RC-proven, 0/24 Production. **כלל מחייב:** כל יוזמה חדשה חייבת לענות: (1) לאיזו Capability שייכת? (2) בשלות נוכחית? (3) צריך RC? Capability חדשה דורשת 9-field contract + אישור יוסי. ראה Section 13.17 (Constitutional Registry).
27. **JJ Business Governance v1.2 — APPROVED ✅ (28 יולי 2026):** מסמך חוזה עסקי מאושר לכל פיתוח פיננסי עתידי. קובץ: `docs/governance/JJ_BUSINESS_GOVERNANCE_V1.md`. החלטות D2–D11 כולן נעולות. **קריאת חובה לפני כל עבודה על:** יתרות שותפים, הקצאת הכנסות, Working Fund, custody, personal funding, settlement classification, balance snapshots, חלוקת רווח, partner reports, dashboards, Settlement Engine. **כלל מחייב:** הסוכן אינו רשאי להסיק התנהגות עסקית מקוד קיים כאשר הוא סותר את ה-Governance המאושר — המסמך המאושר הוא הסמכות. **גבול יישום:** אישור ה-Governance אינו מרשה קוד ייצור. נדרש Implementation Contract נפרד → Architecture Review → Yossi Authorization → Code. ראה Section 13.18.
29. **Owner Workspace P0 Architecture — LOCKED ✅ (7 אוגוסט 2026):** ארבעת מסמכי התכנון (v2.3) נבדקו cross-document, 6 בדיקות עקביות PASS, 0 סתירות. מודל ארבע שכבות (Entity Identity → JJ Relationship → Service Engagement → Property). `property_id` UUID בלתי-ניתן-לשינוי. 66 invariants. 10 ישויות מושגיות. 6 שלבי יישום (P0–P5). **יישום אסור** — חסום עד: סיום Liora/Oshrit + Architecture Review PASS. שלב בנייה הבא: P1. 16 שאלות עסקיות פתוחות (Q1–Q16). קבצים: `docs/planning/OWNER_WORKSPACE_*.md`. **כלל מחייב:** אסור לשנות את ארכיטקטורת P0 אלא אם מתגלה סתירה אמיתית. אסור להתחיל P1 ללא אישור מפורש מיוסי.
26. **D4 — JJ Entity Settlement Model — APPROVED ✅ (27 יולי 2026):** JJ היא גבול ההתחשבנות התפעולי של כל המערכת. **Layer 1:** כל צד חיצוני (Anastasia, suppliers, customers, owners, contractors) מתחשבן מול JJ בלבד — לא מול שותפים. **Layer 2:** שותפים (Yossi, Jacob, future partners) מתחשבנים מול JJ בלבד. **כלל חוקתי:** "Partners do not settle with employees. Partners settle with the company. The company settles with the world." **כלל מחייב:** אסור לחשב יתרת שותף ישירות מול עובד, ספק, לקוח, או מפעיל. אסור ל-Dashboard להציג "Anastasia owes Yossi" — רק "Anastasia ↔ JJ" ו-"JJ ↔ Yossi" בנפרד. אין חריגים אלא אם מוגדרים במפורש ב-governing agreement. **קשר ל-P-LEDGER-1:** D4 הוא ה-governing evidence ש-P-LEDGER-1 דרש — JJ היא ה-Settlement Counterparty תמיד. ראה Section 4 + Section 13.17.

---

## 13.15 Hostaway Property Audit Foundation — PR #71 (MERGED ✅ 23 יולי 2026)

### Gate Record

| Gate | Status | Date |
|------|--------|------|
| Integration Validation | ✅ PASS | 2026-07-23 |
| Architectural Diff Review | ✅ APPROVE_FOR_MERGE | 2026-07-23 |
| CI (typecheck + tests + Vercel) | ✅ ALL PASS | 2026-07-23 |

### מה נכנס ל-main

Read-only audit service + DTO contract v2 for comparing Hostaway reservation data against JJ accounting records.

| File | Purpose |
|------|---------|
| `types.ts` | DTO contracts v2.0, `isRevenueEligible()`, `AuthoritativeAmount`, `AuditMatchState` |
| `computeFinancials.ts` | Pure payout calculations with source/confidence chain |
| `matchReservations.ts` | Period-aggregate + per-reservation matching |
| `propertyAuditService.ts` | Read-only Supabase service (`IPropertyAuditService`) |
| `index.ts` | Barrel exports |
| `computeFinancials.test.ts` | 39 tests |
| `matchReservations.test.ts` | 47 tests |

### Key Design Decisions

| Decision | Detail |
|----------|--------|
| Comparison model | **Period-aggregate** — JJ records Platform Income as multi-month totals; Hostaway has per-reservation data. Reservation-level financial matching is impossible with current JJ data. |
| Revenue eligibility | `isRevenueEligible()` — only `confirmed` and `modified` enter financial totals. All other statuses (`cancelled`, `inquiry`, `owner_stay`, `unknown`) excluded. |
| Financial authority | `AuthoritativeAmount` — every number declares source (`reported`/`calculated`/`unknown`) and confidence (`high`/`medium`/`none`). Airbnb `airbnbExpectedPayoutAmount` (reported) takes priority over calculation. Booking.com = calculated/estimated only. |
| Read-only | Service performs only `.select()` queries. Zero writes. |

### Consumers (future)

CFO Executive, Chief of Staff Executive Brief, Owner Workspace, PR #3 Property Audit UI.

### What is NOT yet supported

- Reservation-level financial reconciliation
- UI components (PR #3 scope)
- DB migrations
- Writes to any table

---

## 13.12 P1-0 — Staff Authorization Infrastructure (Production Certified ✅ 22 יולי 2026)

### Gate Record

| Gate | Status | Date |
|------|--------|------|
| G-P1-0 | ✅ Certified | 2026-07-22 |

> Production authorization infrastructure verified end-to-end using a real authenticated browser session. Diagnostic function removed after proof. No temporary artifacts remain.

### מה הוכח

שרשרת ראיות מלאה מ-Browser Session → JWT → SECURITY DEFINER RPC → auth.uid() → jj_staff_config:

| בדיקה | ערך מוכח |
|-------|---------|
| Browser session | yossiazizi1@gmail.com |
| auth.uid() inside SECURITY DEFINER | `277f81e0-3b89-41ed-a099-22585959b77a` |
| in_staff_config | true |
| staff_is_active | true |
| staff_role | ceo |
| verdict | PASS: auth.uid() = Yossi UUID, role=ceo, active |

### מה הוחל (Migrations)

| Migration | תיאור | סטטוס |
|-----------|-------|-------|
| `p1_0_migration.sql` | `jj_staff_config` table + `require_jj_staff()` function | ✅ Applied |
| `p1_0.1` (patch) | ACL fix for `require_jj_staff` | ✅ Applied |
| B-1…B-5 auth tests | כל תרחישי auth edge-cases | ✅ All PASS |

### Governance Deviation — מתועד

פונקציית הדיאגנוסטיקה הזמנית `test_jj_auth_identity()` תוקנה במהלך G-01 עקב שגיאת `staff_role` עמומה (ambiguous column). השינוי היה בפונקציה הזמנית בלבד — ללא שינוי נתונים עסקיים, ללא השפעה קבועה. הפונקציה נמחקה לאחר הוכחת הראיה (`diagnostic_function_count = 0`).

### קבצים זמניים שנמחקו

| קובץ | סטטוס |
|------|-------|
| `p1_jwt_proof_route.ts` | 🗑️ לא הוגש ל-Git — למחוק ידנית |
| `discover_repo.ps1` | 🗑️ לא הוגש ל-Git — למחוק ידנית |
| `phase3_files/p1_pre_check.ps1` | 🗑️ לא הוגש ל-Git — למחוק ידנית |

### הבא

**P1-1 — Production Certified ✅ (Gate G-P1-1 CLOSED, 22 יולי 2026).** ראה Section 13.13.

---

## 13.13 P1-1 — statements Schema Infrastructure (Production Certified ✅ 22 יולי 2026)

### Gate Record

| Gate | Status | Date |
|------|--------|------|
| G-P1-1 | ✅ Production Certified | 2026-07-22 |

> Migration `p1_1_migration.sql` executed atomically. Full V1–V14 verification + Closeout queries returned PASS evidence. Governance decision issued by ChatGPT after 2-round evidence review. No rollback. No deviations.

### מה הוכח

| בדיקה | ערך מוכח |
|-------|---------|
| statements schema | קיים |
| טבלאות | 6 (statement_series, statement_drafts, statement_draft_lines, sent_statement_snapshots, sent_entry_snapshots, statement_events) |
| indexes | 15 (7 named + 8 PK/UNIQUE) |
| triggers פיזיים | 3 (trg_sent_entries_immutable, trg_sent_snapshots_guard, trg_events_append_only) |
| functions | 13 (9 callable + 4 internal) |
| RLS policies | 6 deny-all |
| RLS enabled | 6 טבלאות |
| SECURITY DEFINER | כל 10 הפונקציות הממשלתיות |
| require_jj_staff | נמצא בגוף כל 9 הפונקציות ה-callable |
| authenticated INSERT/UPDATE/DELETE על immutable tables | false (9/9) |
| service_role INSERT/UPDATE/DELETE על immutable tables | false (9/9) |
| internal functions grants | `postgres=X/postgres` בלבד — אין grant לאף תפקיד אחר |
| CEO seed integrity | UUID=277f81e0, role=ceo, active=true, row count=1 |
| transactions active rows | 2,138 (ללא שינוי) |
| transactions total rows | 2,161 (ללא שינוי) |
| column contracts | owner_party_id=uuid NOT NULL, property_acquisition_id=uuid nullable, opening_balance_eur=numeric nullable, כל 4 שדות OB בטיוטה nullable ללא defaults |

### מה הוחל (Migration)

| Migration | תיאור | סטטוס |
|-----------|-------|-------|
| `p1_1_migration.sql` (CORRECTED v3) | `statements` schema: 6 tables, 7 indexes, 13 functions, 3 triggers, 6 RLS deny-all policies | ✅ Applied atomically |
| SHA-256 | `7916C721B6074065098BDC714DE7D9101CE34A5FA19EA04F3AAE3D4474941BE1` | ✅ Verified by Yossi (PowerShell Get-FileHash) |

### Exception — מתועד

בדיקת FK בין-סכמות (`created_by → auth.users`) לא הוחזרה בשאילתת ה-`information_schema` כי join condition דרשה `constraint_schema = ccu.constraint_schema`. FK מ-`statements` ל-`auth` אינו עומד בתנאי זה. מגבלת כלי האימות — לא כשל מיגרציה.

### Platform Status לאחר G-P1-1

| Layer | Status |
|-------|--------|
| P1-0: Identity + Staff Governance | ✅ Production Certified |
| P1-1: statements Schema Infrastructure | ✅ Production Certified |

**Statement Infrastructure פעילה בפרודקשן:** Identity · Staff Governance · Immutable Snapshots · Draft Lifecycle · Event Ledger · Security Model · Opening Balance Model · Statement Versioning.

---

## 13.17 Ledger & Settlement Constitutional Principles (אושר 26 יולי 2026)

עקרונות אלו נולדו מניתוח AV-005 — Villa Mazotos Purchase & Capital. הם אינם ספציפיים לנכס אחד. הם מתארים דפוסים עסקיים שחוזרים על עצמם בכל עסקת רכישה, כניסת שותף, Working Fund, ו-Settlement ב-JJ.

**מקור:** `AV005_LEDGER.md` v5 — Reference Architecture for JJ Ledger Engine.

### שלוש שכבות ה-Constitution של JJ

| שכבה | מה היא מגדירה | עקרונות מרכזיים |
|------|-------------|----------------|
| **Engineering Constitution** | איך בונים מערכת | P-ARCH-1…9, ADR-001…006, FR-001, FR-002 |
| **Ledger Constitution** | איך מייצגים אירועים עסקיים | P-LEDGER-1, P-LEDGER-2, P-LEDGER-3, Six-Pass Model |
| **Investigation Constitution** | איך מגלים את האמת | P-EVIDENCE-1, Resolution Governance Rule, Phase 1 Rules |

כל שכבה נשענת על הקודמת ולא עוקפת אותה:

```
Authority (Engineering)
    ↓
Composition (Engineering)
    ↓
Ledger (Ledger)
    ↓
Investigation (Investigation)
```

### הפילוסופיה של JJ — משפט אחד

> **JJ does not search for documents.**
> **JJ searches for evidence that answers a business question.**

כל מסמך חדש שנכנס למערכת לא מתחיל תהליך של "קריאה" — מתחיל תהליך של Evidence Resolution לפי P-EVIDENCE-1 ושבעת השלבים.

---

### P-LEDGER — מסגרת מושגית

משפחת P-LEDGER אינה רשימת חוקים — היא מסגרת מושגית שכל עיקרון בה עונה על שאלה בסיסית אחת:

| עיקרון | השאלה שהוא עונה עליה |
|--------|----------------------|
| **P-LEDGER-1** | מי נושא במשמעות הכלכלית, ועם מי מתחשבנים? |
| **P-LEDGER-2** | מתי אירוע ראוי להיכנס ללדג'ר? |
| **P-LEDGER-3** | מתי מתחילה חקירה, ומה תנאי הכניסה שלה? |
| **P-LEDGER-4** | האם הכסף זמין לפעולה עסקית (Settlement) עכשיו? |
| **P-LEDGER-5** | האם האירוע משנה את המציאות הכלכלית, או רק את המיקום? |
| **P-LEDGER-6** | מהו הסכום הסמכותי לחישובים מול בעלים/לקוחות? |

**שלושה שלבי התפתחות של המשפחה:**
- P-LEDGER-1 עד 3: מגדירים **איך לפרש** כסף (interpretation)
- P-LEDGER-4 עד 5: מגדירים **איך להתנהג** עם כסף (behavior)
- P-LEDGER-6: מגדיר **באיזה מספר להשתמש** (measurement)

**כלל לסוכן:** לפני שמנוע חדש מטפל בכסף, הוא חייב לדעת לענות על כל שש השאלות. אם אחת מהן לא ברורה — אין להמשיך.

---

### P-LEDGER-1 — Three-Layer Settlement Rule

> **The economic bearer is not automatically the settlement counterparty.**

כל אירוע עסקי חייב להבחין בין שלושה שכבות עצמאיות:

| שכבה | שאלה |
|------|------|
| **Cash Reality** | מי שילם? מי קיבל? כמה? מתי? |
| **Economic Allocation** | מי נושא בעלות כלכלית, לפי איזה כלל? |
| **Settlement Counterparty** | עם מי מתחשבן הנושא הכלכלי בפועל? |

**השכבות האלו עשויות להיות זהות — אבל אסור להניח שהן זהות ללא ראיה מפורשת.**

**דוגמה (מאושרת):**
- אנסטסיה שילמה €2,400 (Cash Reality)
- אבי נושא ב-50% = €1,200 (Economic Allocation)
- הצד שאבי מתחשבן מולו הוא JJ — לא אנסטסיה (Settlement Counterparty)

**הוכח ב:** Villa Mazotos Purchase (AV-005), Anastasia Working Fund, JJ Internal Clearing, Partner Settlement.

**כלל מחייב:** כל מנוע Settlement, כל שירות Reporting, וכל DTO שחושף נתוני התחשבנות חייב לשמור על הפרדה מפורשת בין שלושת השכבות. אסור לקרוס אותן ללא governing evidence.

---

### P-LEDGER-2 — Ledger Qualification Rule

> **Nothing enters the ledger by proximity. Everything enters by qualification.**

אירוע לא שייך לעסקה בגלל שהוא חולק אותו נכס, אותו תאריך, או אותו משלם.
הוא שייך רק אחרי שעבר שני שערים מפורשים:

| שער | שאלה |
|-----|------|
| **PASS 0 — Transaction Identity** | האם הוא בתוך הזהות הקפואה של הלדג'ר הספציפי? |
| **PASS 1.25 — Cost Qualification** | האם הקישור הכלכלי שלו לעסקה מוכח בראיה? |

**דוגמאות לאירועים שנכשלים בשער זה:**
- הוצאות שיפוץ שנרשמו על אותו נכס — אינן חלק מעסקת הרכישה
- שורה עם תיאור עמום שחולקת תאריך עם הוצאת רכישה
- תשלום שנרשם בטעות על נכס אחר

**זהו ההבדל בין מערכת שעובדת לבין מערכת שאפשר לסמוך עליה בביקורת.**

**כלל מחייב:** כל Ledger Engine, כל Import Pipeline, וכל מנוע Reconciliation חייב לממש שני שערים אלו כתנאי כניסה — לא כשלב post-hoc.

---

### P-LEDGER-3 — Investigation Entry Condition (אושר 27 יולי 2026)

> **PASS 0 is not a step in an investigation.**
> **PASS 0 is the entry condition for an investigation.**
>
> Without PASS 0, there is no investigation.

**סיבה:** A skipped step can be bypassed. An entry condition cannot.

**PASS 0 קופא — לפני שאיסוף ראיות מתחיל:**
- Identity
- Scope
- Governing agreement
- Business scenario

**Constitutional Observation:**

> A wrong fact corrupts a calculation.
> A wrong scope corrupts an investigation.

שגיאות עובדתיות (Wrong Facts) ניתנות לגילוי בדרך כלל מבפנים — מספרים לא מסתדרים, סכום סותר חוזה, שרשרת ראיות שוברת. המערכת עצמה יכולה לזהות אותן.

שגיאות סקופ (Wrong Scope) נשארות לרוב עקביות פנימית. בתוך סקופ שגוי, כל המספרים עדיין מסתדרים, כל הראיות עדיין מתאימות — אין אות שגיאה פנימי. זו הסיבה שהן מסוכנות יותר.

**לכן:** Identity ו-Scope חייבים להיות קפואים לפני שאיסוף ראיות מתחיל. זו אינה המלצה. זו אילוץ חוקתי.

**Constitutional Consequence — Error Inheritance Chain:**

כל שכבה יורשת את גבול השגיאה שלה מהשכבה שמעליה.

```
Identity
    ↓
Scope
    ↓
Evidence
    ↓
Facts
    ↓
Ledger
    ↓
Decisions
    ↓
Settlement
```

כל שכבה מגבילה את מרחב השגיאה האפשרי של השכבה שמתחתיה.

זה אינו רק סדר ביצוע. זו ארכיטקטורת בלימת שגיאות של פלטפורמת JJ.

**כלל מחייב (Constitutional Constraint):** כל Ledger Engine, כל Evidence Engine, כל Settlement Engine, כל Audit Engine, כל Import Pipeline, וכל AI investigation agent חייבים לטפל ב-PASS 0 כתנאי כניסה מחייב — לא כשלב שניתן לדלג עליו. אם PASS 0 לא הושלם, אין חקירה.

> **הערת גבול עתידי (27 יולי 2026):** P-LEDGER-3 חוצה את גבולות ה-Ledger ומשפיע על Evidence, Audit, AI Agents, Import Pipelines, ו-Settlement. בעת רה-ארגון עתידי של משפחות העקרונות, ניתן להעביר אותו למשפחה חדשה (P-INVESTIGATION-1 או P-CONSTITUTION-1). עד אז, הוא נשמר תחת P-LEDGER-3 לשמירת המספור הקיים.

---

### P-LEDGER-4 — Settlement Availability Is a Distinct Axis (אושר 29 יולי 2026)

> **Economic ownership of cash does not automatically confer Settlement Availability.**

כל סכום כסף ב-JJ ניתן לתיאור בשלושה צירים עצמאיים:

| ציר | שאלה |
|-----|------|
| **Economic Ownership** | למי הכסף שייך? |
| **Custody / Location** | מי מחזיק בו ואיפה הוא נמצא פיזית? |
| **Settlement Availability** | האם ניתן לכלול אותו בהצעת Settlement עכשיו? |

**שלושת הצירים עצמאיים.** כסף יכול להיות: בבעלות JJ ✓, בידי אנסטסיה ✓, ולא זמין ל-Settlement ✓ — בו-זמנית.

**שני אירועים שמורידים Settlement Availability:**
1. **Approved Distribution** — כסף שאושר להפצה הופך "תפוס" לפני שהוא משולם. אסור לכלול אותו בהצעת Settlement נוספת.
2. **Custody עם גורם חיצוני** — כסף שמוחזק על ידי אנסטסיה (או כל גורם שאינו JJ) אינו זמין ל-Settlement עד שהוא מועבר לקופת JJ.

**חוזה מחייב (Settlement Balance Provider):**
```
compute_available_settlement_balance(entity_id, cutoff_date) → NUMERIC
= cashbox(entity) − approved_pending_distributions(entity)
```
זהו ה-interface היציב. כל מנוע Settlement קורא לחוזה בלבד — לא לנוסחה הפנימית.

**כלל מחייב:** כל Settlement Engine, כל Reporting Engine, כל Dashboard, וכל AI Agent חייבים להכיר בשלושת הצירים. אסור להציג "Balance = €X" ללא הבהרה של Settlement Availability. אסור לחלק כסף שאינו Settlement Available — גם אם הוא בבעלות JJ.

**מקור:** ADR-P2-006 (Settlement Calculation Policy), PQ-2 + PQ-3, שיחת יוסי 29 יולי 2026.

---

### P-LEDGER-5 — Transfer Is Not an Economic Event (אושר 29 יולי 2026)

> **A transaction with category='Transfer' changes custody and location. It never creates income, expense, profit, or loss.**

עסקת Transfer משנה:
- **Custodian** — מי מחזיק את הכסף
- **Location** — איפה הכסף נמצא פיזית
- **Settlement Availability** — ייתכן שישתנה (לא-זמין → זמין, כאשר אנסטסיה מעבירה לJJ)

עסקת Transfer **לעולם לא** משנה:
- הכנסה
- הוצאה
- רווח
- הפסד

**כלל חוקתי רוחבי — תקף לכל מנוע ב-JJ:**

| מנוע | כלל |
|------|-----|
| Import Pipeline | Transfer rows אינן מסווגות כ-income/expense |
| Banking Integration | העברת כסף בין חשבונות JJ אינה P&L |
| AI Agents | אסור להסיק רווח/הפסד מ-Transfer |
| Reconciliation | Transfer מזוהה כשינוי מיקום — לא כאירוע כלכלי |
| Settlement Engine | Transfer משנה Settlement Availability — לא את היתרה הכלכלית |

**כלל מחייב:** כל מנוע שמקבל שורות transactions חייב לזהות `category='Transfer'` ולטפל בה כשינוי מיקום/משמורת בלבד. כל מנוע שמסווג Transfer כהכנסה או הוצאה — שגוי.

**מקור:** ADR-P2-006 (PQ-3 decision), שיחת יוסי 29 יולי 2026.

---

### P-LEDGER-6 — Owner-Facing Amount Basis (אושר 31 יולי 2026)

> **Owner liabilities are calculated using the owner's billed amount (`client_charge`) when present; otherwise the recorded transaction amount (`amount_eur`).**

**נוסחה קנונית:**
```sql
COALESCE(client_charge, amount_eur)
```

**שני המספרים:**

| שדה | מה הוא מייצג | מתי הם שונים |
|-----|-------------|-------------|
| `amount_eur` | הסכום שעבר בפועל (Cash Reality) | תמיד קיים |
| `client_charge` | הסכום שחויב לבעלים/לקוח (Billed Amount) | כאשר JJ גובה מחיר שונה מהעלות בפועל |

**הכלל:**

כאשר JJ מחשבת כמה בעלים חייב או זכאי — הסכום הרלוונטי הוא **מה שחויב** (`client_charge`), לא מה ששולם בפועל (`amount_eur`). כאשר `client_charge` = NULL, הסכום שחויב שווה לסכום ששולם.

**דוגמה מוכחת (FPE L2, Villa Mazotos, AV-1):**
- שימוש ב-`amount_eur` בלבד → הוצאות €13,574.62
- שימוש ב-`COALESCE(client_charge, amount_eur)` → הוצאות €14,828.29
- דלתא = €1,253.67, שנובעת משורות שבהן `client_charge ≠ amount_eur`
- AV-1 אימות עסקי → €14,828.29 הוא הנכון

**מה זה לא:**
- לא כלל לחישוב תזרים מזומנים (Cash Position = L1, שם `amount_eur` הוא הסמכותי)
- לא כלל לחישוב הון שותפים (Partner Capital = שכבה עתידית, כללים ייקבעו)
- לא כלל ליבוא נתונים (Import = Cash Reality, שומר על שני השדות)

**תחולה:**

| מנוע / שכבה | כלל Amount |
|-------------|-----------|
| FPE L1 — Cash Position | `amount_eur` (Cash Reality) |
| FPE L2 — Owner Liabilities | `COALESCE(client_charge, amount_eur)` ← **P-LEDGER-6** |
| RC3 — Client Report | `COALESCE(client_charge, amount_eur)` ← **P-LEDGER-6** |
| Settlement Engine (עתידי) | ייקבע — ייתכן הפרדה בין שכבות |
| Import Pipeline | שומר את שני השדות כפי שהם — לא מחליף |

**כלל מחייב:** כל מנוע שמחשב יתרת בעלים, חיוב לקוח, או כל סכום owner-facing חייב להשתמש ב-`COALESCE(client_charge, amount_eur)`. שימוש ב-`amount_eur` בלבד לחישוב owner-facing הוא שגיאה.

**מקור:** FPE L2 Engineering Sprint 2, אימות AV-1, אושר ע"י יוסי 31 יולי 2026.

---

### D4 — JJ Entity Settlement Model (אושר 27 יולי 2026)

**החלטה עסקית מאושרת:** JJ היא גבול ההתחשבנות התפעולי הקבוע של המערכת.

**Two-Layer Settlement Model:**

```
Layer 1 — JJ ↔ World

  External Party ↔ JJ

  Examples:
    Anastasia ↔ JJ
    Supplier   ↔ JJ
    Customer   ↔ JJ
    Owner      ↔ JJ
    Contractor ↔ JJ

  Every operational balance exists only against JJ.
  Never against individual partners.

Layer 2 — JJ ↔ Partners

  Partner ↔ JJ

  Examples:
    Yossi          ↔ JJ
    Jacob          ↔ JJ
    Future partner ↔ JJ

  Partner balances are derived from JJ.
  Never derived directly from employees, suppliers, or customers.
```

**Constitutional Rule:**
> Partners do not settle with employees.  
> Partners settle with the company.  
> The company settles with the world.

**Architectural Consequence:**
- Employees are never counterparties to partner settlements.
- Suppliers are never counterparties to partner settlements.
- Customers are never counterparties to partner settlements.
- Every external relationship terminates at JJ.
- Partner balances begin at JJ.

**כלל מחייב:** כל Ledger Engine, כל Settlement Engine, כל Reporting Engine, וכל Dashboard חייבים לכבד את המבנה הזה. אסור לחשב יתרת שותף ישירות מול צד חיצוני. אין חריגים אלא אם מוגדרים במפורש בהסכם מחייב (governing agreement).

**Dashboard Architecture Targets (Track A — future implementation):**
- Dashboard A (JJ Operational Ledger): מציג את כל היחסים בין JJ לצדדים חיצוניים — JJ ↔ Anastasia, JJ ↔ Suppliers, JJ ↔ Customers, JJ ↔ Owners, JJ ↔ Contractors.
- Dashboard B (Partner Settlement Ledger): מציג את כל היחסים בין JJ לשותפים — JJ ↔ Yossi, JJ ↔ Jacob, כולל: כל נכס, כל העברה, כל הכנסת JJ, כל הוצאת JJ, כל הפקדת הון, כל התחשבנות. יתרה אחת רצה לכל שותף.

**Relationship to P-LEDGER-1:**
P-LEDGER-1 קבע: "Economic bearer is not automatically the Settlement Counterparty." D4 הוא ה-governing evidence ש-P-LEDGER-1 דרש: JJ היא ה-Settlement Counterparty — תמיד. לצדדים חיצוניים בLayer 1, ולשותפים בLayer 2.

---

### הקשר לעקרונות קיימים

| עיקרון | מקור | קשר ל-P-LEDGER |
|--------|------|---------------|
| P-ARCH-1: Unknown = NULL | M8 | P-LEDGER-1 מרחיב: Economic bearer unknown = NULL (לא Anastasia) |
| P-ARCH-2: Yossi ≠ Jacob ≠ JJ | M8 | P-LEDGER-1: Settlement Counterparty מחייב שמירת זהות השותף |
| P-ARCH-8: JHKA הוא מקור האמת | ADR-001 | P-LEDGER-2: Qualification דורשת ראיה — JHKA מספק אותה |
| Evidence before certainty | — | P-LEDGER-2: "by qualification" = "by evidence" |
| Composition may aggregate; never replace | G3-C | P-LEDGER-1: Settlement chain יכולה לעבור דרך JJ; אינה מחליפה את ה-direct obligation |
| P-EVIDENCE-1: חקירה מתחילה משאלה עסקית | AV-005 | P-LEDGER-3: Entry condition → שאלה עסקית חייבת להיות מוגדרת לפני PASS 0 |
| Wrong Scope > Wrong Fact | AV-005 Phase 1 | P-LEDGER-3: גבולות הסקופ הם ההגנה העיקרית — לא אימות מספרים |
| D4: JJ Entity Settlement Model | AV-005 + בשלות עסקית | P-LEDGER-1: D4 מספק את ה-governing evidence — JJ היא ה-Settlement Counterparty תמיד |
| Entity balances remain separate | ADR-P2-006 PQ-2 | P-LEDGER-4: אחוזי בעלות לא יוצרים זכאות ללא Approved Distribution מפורש |
| Approved Distribution reduces availability | ADR-P2-006 F2 | P-LEDGER-4: כסף שאושר להפצה אינו Settlement Available — גם לפני תשלום |
| Transfer = custody change only | ADR-P2-006 PQ-3 | P-LEDGER-5: Transfer אינו אירוע כלכלי — אסור לסווג כ-income/expense |
| Billed amount ≠ cash amount | FPE L2 / AV-1 | P-LEDGER-6: owner-facing calculations use COALESCE(client_charge, amount_eur) — not amount_eur alone |

### P-EVIDENCE-1 — Evidence Question Rule (אושר 26 יולי 2026)

> **Evidence collection always begins with a business question.**
>
> Never begin from a document. Never begin from a row. Begin from the business fact that must be proven.

**זרימת חקירה (7 שלבים מחייבים):**
```
Business Question → Evidence Sources → Evidence Collection
→ Evidence Evaluation → Evidence Outcome → Ledger Impact
→ Architecture Impact (Expected: NONE)
```

**ארבע תוצאות מותרות בלבד:**
`Confirmed Fact` | `Confirmed Duplicate` | `Confirmed Separate Events` | `Unknown`

`Unknown` היא תוצאה שלמה וחוקית. כל תוצאה חמישית ("כנראה", "נראה ש...") אסורה.

**כלל מחייב:** הסעיף האחרון בכל Evidence Item חייב להיות `Architecture impact: NONE`. אם לא — עוצרים ומחקירים, לא משנים ארכיטקטורה.

### Resolution Governance Rule (אושר 26 יולי 2026)

לאחר שהארכיטקטורה ננעלת, העבודה היא Business Investigation בתוך מסגרת קבועה.

```
Evidence resolves facts.

Decisions resolve agreements.

Architecture resolves neither.
```

| סוג | מה הוא משנה | מה הוא אינו יכול לשנות |
|-----|------------|----------------------|
| **Evidence** | מצב עובדתי של שורה או אירוע | המודל, העקרונות, השערים |
| **Decision** | הסכם שאין עליו אמת עובדתית אחת | עקרונות חוקתיים; עובדות שכבר אושרו |
| **Architecture** | המסגרת שבה Evidence ו-Decision נרשמים | שום דבר — היא ה-container, לא ה-content |

**כלל מחייב:** כל מנוע עתידי חייב ליישם את הסדר:
```
Identify transaction → Qualify event → Preserve cash reality
→ Determine economic bearer → Determine settlement counterparty → Calculate settlement
```

לא:
```
Import rows → Sum by payer → Infer who owes whom
```

*עודכן: 31 יולי 2026 — P-LEDGER-6 (Owner-Facing Amount Basis) אושר ע"י יוסי כעיקרון חוקתי (Section 13.17). כלל קנוני: `COALESCE(client_charge, amount_eur)` לכל חישוב owner-facing. מקור: FPE L2 Sprint 2 + AV-1 validation. FPE L2 Component Certified ✅ (Yossi approved). שלוש שכבות P-LEDGER: interpretation (1–3) + behavior (4–5) + measurement (6). טבלת הקשר עודכנה: +1 שורה. מנוע FPE: L1 ✅ + L2 ✅, L3 לא מאושר.*
*עודכן: 29 יולי 2026 — P-LEDGER-4 + P-LEDGER-5 אושרו ע"י יוסי כעקרונות חוקתיים (Section 13.17). P-LEDGER-4: Settlement Availability כציר שלישי עצמאי — נפרד מ-Ownership ומ-Custody. שני אירועים מורידים זמינות: Approved Distribution + custody חיצוני. חוזה: `compute_available_settlement_balance(entity_id, cutoff_date)`. P-LEDGER-5: Transfer אינו אירוע כלכלי — כלל רוחבי לכל מנוע ב-JJ. טבלת הקשר עודכנה: +3 שורות (PQ-2, F2, PQ-3). מקור: ADR-P2-006 (Settlement Calculation Policy), שיחת יוסי 29 יולי 2026.*
*עודכן: 29 יולי 2026 — RC-004 CEO Workspace MERGED ✅ (PR #83, Merge SHA: `75e994370e82594495e0c5246c5768f997559838`). Reference Case #4. `/ceo` route — Tree A, 2 tabs (Company placeholder + Brief reuse). 4 files (3 new + 1 modified). Contract B fulfilled, Contract E.1 CEO-only. Gate 0 10/10 PASS. CI PASS on main. Branch deleted. Task Status + execution order עודכנו. הבא: Screen Alignment (Finance → PageShell).*
*עודכן קודם: 27 יולי 2026 — NAV-1 Phase 4 Composition Rules v1.0 LOCKED ✅. Implementation Gates v1.1 (Gate 0 Foundation Check + Gate 4 Closeout added per Yossi). NAV-1 Architecture COMPLETE — Implementation AUTHORIZED via Gates v1.1. הוראה 24 עודכנה.*
*עודכן קודם: 27 יולי 2026 — D4 JJ Entity Settlement Model אושר ע"י יוסי. Two-Layer Model: Layer 1 (כל צדדים חיצוניים ↔ JJ) + Layer 2 (שותפים ↔ JJ). כלל חוקתי: "Partners do not settle with employees. Partners settle with the company. The company settles with the world." Dashboard A (JJ Operational Ledger) + Dashboard B (Partner Settlement Ledger) — architecture targets defined. D4 = governing evidence ל-P-LEDGER-1 — JJ היא ה-Settlement Counterparty תמיד. הוראה 26 נוספה. Section 4 + Section 13.17 עודכנו.*
*עודכן קודם: 27 יולי 2026 — NAV-1 Phase 3 v1.1 LOCKED ✅ (מסמך חוקתי #8). 4 amendments applied: G8 streaming-safe reword, AttentionLayer configurable timeout, WH-F5 exit route ownership, EXPERIMENTAL stability tier note. Constitutional Registry עודכן: 7→8 מסמכים חוקתיים. הוראות 24 עודכנה + 25 נוספה. Implementation Gates APPROVED (operational). הבא: Phase 4 — Composition Rules (באישור יוסי). Implementation: NOT AUTHORIZED.*
*עודכן קודם: 27 יולי 2026 — NAV-1 Phase 2 v1.1 LOCKED ✅ (מסמך חוקתי #7). JJ_NAV_PRINCIPLES.md LOCKED ✅ (מסמך חוקתי #6). NAV-1 Phase 1 LOCKED ✅. Constitutional Registry עודכן: 5→7 מסמכים חוקתיים. הוראה 24 נוספה לסוכנים. Workspace Registry appendix נוסף ל-Phase 2: 7 workspaces, governance. Per-contract status headers נוספו: A+B FROZEN, C+D STABLE, E EXPERIMENTAL. Implementation: NOT AUTHORIZED. הבא: Phase 3 — Component Contract (באישור יוסי).*
*עודכן קודם: 27 יולי 2026 — P-LEDGER-3 אושר ע"י יוסי: "Investigation Entry Condition". PASS 0 הוגדר מחדש כתנאי כניסה לחקירה, לא כשלב בה. Constitutional Observation נוסף: "A wrong fact corrupts a calculation. A wrong scope corrupts an investigation." Error Inheritance Chain: Identity → Scope → Evidence → Facts → Ledger → Decisions → Settlement. הערת גבול עתידי: P-LEDGER-3 חוצה גבולות Ledger — ניתן להעביר ל-P-INVESTIGATION-1 ברה-ארגון עתידי. מקור: AV005_LEDGER.md v8, שיחת יוסי 27 יולי 2026.*

*Section 13.17 נוספה: 26 יולי 2026 — P-LEDGER-1 + P-LEDGER-2 אושרו ע"י יוסי. Resolution Governance Rule נוסף. מקור: AV005_LEDGER.md v5.*

---

## 13.18 JJ Business Governance v1.2 — Approved Financial Business Contract

**קובץ:** `docs/governance/JJ_BUSINESS_GOVERNANCE_V1.md`  
**גרסה:** v1.2  
**סטטוס:** ✅ APPROVED — Implementation Contract Ready  
**אושר ע"י:** Yossi  
**תאריך אישור:** 2026-07-28  
**תחום:** D2–D11 (כולם מאושרים)

### מהו המסמך הזה

Business Governance v1.2 הוא **חוזה העסקי** לכל פיתוח פיננסי עתידי ב-JJ. הוא אינו מפרט טכני, אינו SQL, ואינו Implementation Plan. הוא מגדיר **כיצד העסק עובד** — ברמה שמנוע ההתחשבנות, דוחות השותפים, ה-Settlement Engine, ו-Financial Dashboards חייבים לכבד.

המסמך יושב בשרשרת החוקתית בין עקרונות הלדג'ר לבין קוד הייצור:

```
North Star → Product Constitution → Ledger Constitution
    ↓
Business Governance v1.2  ← כאן
    ↓
Implementation Contract (עתידי)
    ↓
Production Code
```

### קריאת חובה

**לפני כל עבודה על אחד מהנושאים הבאים, הסוכן חייב לקרוא `docs/governance/JJ_BUSINESS_GOVERNANCE_V1.md`:**

- יתרות שותפים (partner balances)
- הקצאת הכנסות החברה (company income allocation)
- קרן עבודה / Working Fund (Anastasia clearing)
- אחזקת מזומן (cash custody)
- מימון אישי של הוצאות JJ (personal funding)
- סיווג עסקאות Settlement
- Balance Snapshots היסטוריים
- חלוקת רווח (profit distribution)
- דוחות שותפים (partner reports)
- Financial Dashboards
- Settlement Optimization Engine

**כלל מחייב:**
> הסוכן אינו רשאי להסיק התנהגות עסקית מקוד קיים כאשר אותו קוד סותר או שותק לגבי מסמך ה-Governance המאושר.
> **המסמך המאושר הוא הסמכות העסקית. קוד קיים הוא עדות להתנהגות הנוכחית, לא סמכות להתנהגות העתידית.**

### אינדקס D2–D11

| החלטה | כלל מרכזי | סטטוס |
|-------|-----------|-------|
| **D2 — Running Partner Ledger** | Property positions נשמרות אנליטית. התחשבנות הסמכותית גלובלית. | ✅ |
| **D3 — JJ Income Allocation** | Category A (הכנסת נכס) ← לפי הסכם נכס. Category B (שירות JJ) ← לפי הסכם שותפות. אסור לערבב. | ✅ |
| **D4 — Company Settlement Boundary** | JJ מתחשבנת עם העולם. שותפים מתחשבנים עם JJ. ראה Section 4 + Section 13.17. | ✅ |
| **D5 — Net Partner Balance** | יתרה נטו אחת מחייבת לכל שותף. | ✅ |
| **D6 — Historical Ledger** | היסטוריה תמיד ניתנת לחישוב מחדש מהאירוע הראשון. Snapshots = checkpoint בלבד, אינם מחליפים היסטוריה. | ✅ |
| **D7 — Personal Funding Rule** | מקור המימון קובע חבות — לא שדה ה-payer. מימון אישי → JJ חייבת לאדם. מימון JJ → הוצאה בלבד. | ✅ |
| **D8 — Settlement Classification** | רגל לדג'ר אחת = סיווג אחד. אירוע עסקי אחד יכול לכלול רגלים מרובות מקושרות (business_event_id). | ✅ |
| **D9 — Cash Ownership vs Custody** | בעלות ואחזקה עצמאיות. Working Fund clearing דו-כיווני: custodian owed / JJ owed / zero. | ✅ |
| **D10 — Settlement Optimization Engine** | מינימום פעולות לריצת Settlement מוגדרת. Settlement Counterparty = תמיד JJ. Execution Route = יכול להיות ישיר (עם שתי רגלי JJ בלדג'ר). | ✅ |
| **D11 — Retained Profit vs Distribution** | רווח מוכר אינו יוצר אוטומטית חבות Settlement. רק אחרי החלטת חלוקה מפורשת נוצרת חבות. | ✅ |

### גבול היישום

Business Governance v1.2 מאושר כ-Input Contract לעיצוב ה-Settlement Engine העתידי.

**אישור חוזה העסקי אינו מרשה יישום קוד ייצור.**

יישום מחייב Implementation Contract נפרד שיגדיר:

- Authority boundaries
- Data contracts
- Ledger event model
- `business_event_id` model
- Settlement Run inputs + outputs
- Approval workflow
- Audit requirements
- Security requirements
- Migration strategy
- Rollout gates
- Test and verification gates

**רצף נדרש:**
```
Business Governance v1.2 (✅ APPROVED)
    ↓
Implementation Contract (עתידי — Settlement Engine v0.1)
    ↓
Architecture Review
    ↓
Yossi Authorization
    ↓
Production Code
```

---
*עודכן: 28 יולי 2026 — JJ Capability Architecture v1.0 APPROVED ✅ (מסמך חוקתי #9). 3 שכבות, 24 Capabilities, 9-field contracts, Maturity + AI Autonomy models, Production Gate, Capability Lifecycle, Evidence Index. Constitutional Registry עודכן: 8→9 מסמכים חוקתיים. הוראה 28 נוספה. אפס שינויי קוד/SQL/schema/DB.*
*עודכן קודם: 28 יולי 2026 — PR #80 Owner Entity Context MERGED ✅ (Merge SHA: `dfd0636046cf632454be595dc0dec362cd56d6a2`). Reference Case #3. Workspace-to-frame entity communication proven: EntityContextBridge sets GlobalContext.entityContext from server-resolved owner identity, clears on unmount/workspace change. No OperatingFrame changes. No GlobalContext shape changes. Deterministic exit /owners. 4 files, 18 tests, Gates 0–4 ALL PASS, CI PASS on main. Branch `rc003/owner-entity-context` DELETED. Three Reference Cases now complete: #1 (Architecture→Frame) + #2 (Authority→Home) + #3 (Workspace→Context→Frame).*
*עודכן קודם: 28 יולי 2026 — PR #79 Home Workspace Completion MERGED ✅ (Merge SHA: `33113896ada9a28d6866cda75e550c27696fe08f`). Reference Case #2. Replaced placeholders with real business data from ExecutiveBriefDTO. Zero new providers. Pure transform buildHomeBrief(). allClear truth table (true/false/null). 9 files, ~50 test assertions, Gates 0–4 ALL PASS, CI PASS on main. Branch `home/workspace-completion-pr79` DELETED. Two Reference Cases now complete: #1 (Architecture→Frame) + #2 (Authority→Home).*
*עודכן קודם: 28 יולי 2026 — NAV-1 PR #78 OperatingFrame + Home Slice MERGED ✅ (Merge SHA: `5bf79584028282faedff03b6d6e221d528bfead7`). First validated NAV-1 vertical slice. 26 files, Gates 0–4 ALL PASS, CI Run #306 PASS on main. Amendment approved: `<main>` landmark delegation (Phase 3 v1.1 → v1.2). Route group `(app)/` isolates internal routes from partner routes. Branch `nav1/operating-frame-home-slice` DELETED. Task Status, Instruction 24+25, execution order עודכנו. `NAV1_PR1_AMENDMENT_PROPOSAL.md` marked APPROVED.*
*עודכן קודם: 28 יולי 2026 — Settlement Engine Architecture Sprint 1 CLOSED ✅ + Schema Design Package v1.1 LOCKED ✅ (Final Architecture Review PASS). Engineering Spec v1.2 (Architecture COMPLETE) + Schema Design Package v1.1 (LOCKED) — שני המסמכים המרכזיים נעולים. מה נוסף ב-v1.1: Part 0 (Data Type Constitution + Naming Constitution), Part 4b (State Machine Appendix — 8 status fields, כל מעברים חוקיים + אסורים), Part 4c (Locking Specification — lock order, advisory locks, timeout 5s/30s, retry policy), Appendix A (Error Code Catalog — 26 codes JJ-SET-001…JJ-SET-073, Contract rule: Never Reuse), Appendix B (Versioning Policy — Patch/Minor/Major, migration numbering YYYYMMDD_NNN), State Machine Test Coverage Gate (כל מעבר חייב Integration Test). קבצים: `docs/specifications/SETTLEMENT_ENGINE_ENGINEERING_SPEC_V1.md` (v1.2) + `docs/specifications/SCHEMA_DESIGN_PACKAGE_V1.md` (v1.1). Implementation authorized — הבא: Phase 0 source verification (read-only) → Phase 1 migration SQL.*
*עודכן קודם: 28 יולי 2026 — JJ Business Governance v1.2 אושר ע"י יוסי (D2–D11 נעולים). נרשם כ-mandatory reading authority ב-Section 13.18 + הוראה 27. Settlement Engine implementation מחייב Implementation Contract נפרד — קוד ייצור לא מורשה עדיין. אפס שינויי קוד/SQL/schema/DB.*
*עודכן קודם: 26 יולי 2026 — P-LEDGER-1 + P-LEDGER-2 אושרו כעקרונות חוקתיים (Section 13.17). Resolution Governance Rule נוסף: "Evidence resolves facts. Decisions resolve agreements. Architecture resolves neither." ארבעה שלבי רזולוציה (E1–E8, D1–D4). Architecture phase of AV-005 CLOSED. P-LEDGER-1: Three-Layer Settlement Rule. P-LEDGER-2: Ledger Qualification Rule (PASS 0 + PASS 1.25). כלל מחייב: כל Settlement Engine, Ledger Engine, Import Pipeline, ו-Reconciliation Engine חייב לממש שניהם. P-EVIDENCE-1: Evidence Question Rule — חקירה תמיד מתחילה משאלה עסקית, לא ממסמך או שורה. 7 שלבי חקירה + 4 תוצאות מותרות + Architecture impact = NONE.*
*עודכן קודם: 26 יולי 2026 — Foundation Freeze PASS ✅. Constitutional Registry (Section 13.17) נוספה: 5 מסמכי יסוד + 7 ADRים פנימיים. Cross-reference audit: 0 סתירות, 2 הפניות חסרות (natural gap — לא כשל). UI Governance Rule נוספה ל-Section 13.16. סדר ביצוע עודכן: Foundation Freeze → NAV-1 → CEO Workspace → Screen Alignment → Final Audit → CRM/Calendar/Mobile.*
*עודכן קודם: 26 יולי 2026 — JJ Design System v1.0 LOCKED ✅ (מסמך חוקתי #5). `JJ_DESIGN_SYSTEM_V1.0.md` נעול: 9 חלקים (EX-1…EX-6 Experience Identity, 17 Component Contracts, Semantic Token Layer, Screen Migration Matrix, Release Gates). CEO Dashboard → Option D (CEO Workspace). 12/12 DS files verified on GitHub main (COMP-1/COMP-2 = OneDrive sync, not product defect). Section 13.16 + Instruction 23 נוספו. סדר עבודה עודכן: DS v1.0 LOCKED → NAV-1 → Screen Alignment → Final Audit Gate. NAV-1 NOT AUTHORIZED — דורש Gate נפרד.*
*עודכן קודם: 26 יולי 2026 — G3-B Owner Workspace Reservations + Portfolio Alignment CLOSED ✅ (PR #77, Merge SHA: `bf43d10e6c07f0085cdb77d26071e81cd4e435cb`). 6 new files + 1 modified: ownerReservationAdapter, ownerReservationService, ownerPortfolioAdapter + 3 test files. G3-2 (no pms.* reads), G3-5 (no local revenue arithmetic), G3-19 (guest masking), P-ARCH-1 (null preserved), G3-17 (boundary preserved), G3-18 (no adapter-to-adapter) — all verified on main. CI PASS. 2 fixes during CI loop: case 'unknown' TS error + clearAllMocks vs resetAllMocks. G3-C DEFERRED. Instruction 21 נוספה. ADR-006 Task Status + Instruction 20 עודכנו. main HEAD: `bf43d10e`.*
*עודכן קודם: 25 יולי 2026 — G1 Identity Authority Consolidation CLOSED ✅ (PR #73, Merge SHA: `f00adf40f72cc4fe4175109d253c0ac93659802c`). Owner Workspace unified behind `lifecycle.entity_identity` + `management_relationship` via `identityResolverService`. `KNOWN_OWNERS` removed. 7 files, CI PASS. ADR-006 updated: R7 Foundation→Production MISSING→STABLE, R11 MISSING→DRAFT, Active Boundary Conflicts 2→1. G3 remains open. Instruction 20 נוספה. main HEAD: `f00adf40`.*
*עודכן קודם: 23 יולי 2026 — Hostaway Property Audit Foundation PR #71: MERGED ✅ (Merge SHA: `0562e0ae40e4734bfc0985d7683503763a06b4ee`). Read-only audit service + DTO contract v2. 7 files, 86 tests, CI ALL PASS. Period-aggregate matching. `isRevenueEligible()` canonical. `AuthoritativeAmount` with source/confidence. No UI/migrations/writes. Branch `hostaway/property-audit-contract-v2` deleted (auto). Section 13.15 + Instruction 19 נוספו. main HEAD: `0562e0ae`.*
*עודכן קודם: 23 יולי 2026 — Finance Knowledge Graph PR #70: MERGED ✅ (Merge SHA: `2e7e34eb88162887fd98f09f4883ba9b7f72190a`). Migration Gate 25/25 PASS. finance schema Production Certified: 4 tables, 2 triggers (IL-1/IL-4), 3 Claim Templates, RLS deny-all RESTRICTIVE. Evidence→Claim→Position→Decision→Explanation→Immutable Audit chain proven end-to-end. Branch `feat/finance-decision-vertical-slice` deleted. RC2 BLOCKED — Gate required. Section 13.14 + Instruction 18 נוספו. main HEAD: `2e7e34eb`.*
*עודכן: 22 יולי 2026 — P1-1 statements Schema Infrastructure: Production Certified ✅ (Gate G-P1-1 CLOSED). Change Log: Gate=G-P1-1 | Status=Production Certified | Date=2026-07-22 | Evidence: Pre-flight PRE-1–PRE-9 PASS, migration committed (result=[]), V1–V14 verified, Closeout queries 1–5 verified, service_role immutable protection verified (false 9/9), CEO seed preserved (uuid=277f81e0, role=ceo, active=true), 3 physical triggers verified, transaction counts preserved (2138/2161). Exception: cross-schema FK query methodology excludes auth.* references — limitation of verification query, not migration failure. Section 13.13 נוספה.*
*עודכן קודם: 22 יולי 2026 — P1-0 Staff Authorization Infrastructure: Production Certified ✅ (Gate G-P1-0 CLOSED). Change Log: Gate=G-P1-0 | Status=Production Certified | Date=2026-07-22 | Evidence: P1-0 migration PASS, P1-0.1 ACL fix PASS, B-1…B-5 auth tests PASS, JWT Proof PASS (auth.uid()=277f81e0, role=ceo, active=true), diagnostic function removed (count=0), seed verified, no temporary production artifacts remain. Section 13.12 נוספה. הבא: P1-1 Execution Package (Gate G-P1-1 נפרד).*
*עודכן קודם: 22 יולי 2026 — CFO Constitution APPROVED ✅ (מסמך חוקתי #8, Executive Constitution ראשון). 8 עקרונות מייסדים (CFO-1…CFO-8), Position Lifecycle (Reality→Position→Decision→Outcome→Learning), 8 acceptance criteria. Position Identity + Executive Performance Intelligence נרשמו כחזון עתידי (לא במסמכים). הבא: CFO MVP — Phase 1 Financial Reality Baseline.*
*עודכן קודם: 22 יולי 2026 — PR #69 MERGED ✅ (SHA ff18329). DAL v0.1 + M0 Chief of Staff MVP על main. 19 קבצים, CI PASS, Vercel PASS. Branch `dal/v0.1-m0-access-foundation` נמחק. M0 unfrozen — released for Product Review. NEEDS_CEO_ROLE_CONTRACT open. main HEAD frozen baseline עודכן: ff18329.*
*עודכן קודם: 22 יולי 2026 — ADR-003 updated: DAL-8 added ("Access decisions are business decisions, not technical decisions"). OD-6 CLOSED — DAL v0.1 scope defined (4 capabilities: authenticate, resolve scope, evaluate Awareness+View, auditable result).*
*עודכן קודם: 22 יולי 2026 — ADR-003 Decision Access Layer APPROVED ✅ (מסמך חוקתי #4). M0 Chief of Staff FROZEN — ממתין ל-DAL. הוראות 16+17 נוספו לסוכנים.*
*עודכן קודם: 22 יולי 2026 — WA-001 Phase 2 EXECUTED — VERIFIED ✅. 3 CPs (CP-Q003 property name 201→101, CP-Q001 prior debt €0→€850, CP-Q002 deposit/rent reallocation). 4 rows modified, 17/17 verification gates PASS. New baselines: Active rows=2,139, Active amount_eur=12,632,172.23, Active CC=113,460.13. Anastasia: cash_collected=137,451.86, cash_on_hand=10,074.88. Cashboxes unchanged. Total preserved rows=2,161.*
*עודכן קודם: 21 יולי 2026 — AV-1 Pilot CLOSED ✅. Validated scope: Villa Mazotos Renovation + Rental + Airbnb + Operational Portfolio. Not yet: Purchase/Capital/Settlement/Sale/PDF. KI-003 open (2 "Other" rows €336.33). הבא: AV-005 Villa Mazotos Purchase & Capital. Frozen Baseline: main=85a6753.*
*עודכן קודם: 21 יולי 2026 — PR #58 MERGED ✅ (bef71c3, IncomeTable + ExpenseTable — DTO-verified, not yet wired into PartnerReport). PR #59 MERGED ✅ (20a4387, R4 — SettlementCard + NeedsAttentionItems wired). PR #67 MERGED ✅ (890bc5c, RC3 data layer fix — createServiceClient replaces anon singleton, Production Ready). RC3 pipeline end-to-end ✅. Gap: PartnerReport wiring not implemented — ExecutiveSummary income/expenses/netResult still null. הבא: RC3 Financial UI Wiring PR.*
*עודכן: 20 יולי 2026 — EXC-1 CLOSED ✅ (audit notes on two €5,000 offset legs). DS-009B CLOSED ✅. **Track A FROZEN — כל הפריטים סגורים.** בסיסים סופיים: Active rows=2,136, Active CC=€113,460.13, All-rows CC=€120,555.14, Cashboxes unchanged.*
*עודכן קודם: 20 יולי 2026 — DS-009B CLOSED ✅. CP-DS009B-WAIVER (CC 500→0) + CP-DS009B-VIEW (Staff Accommodation Rent → rent_collected). Uriel owner_balance 3,000→5,500. 28/28 gates PASS. Active CC 113,960.13→113,460.13. All-rows CC 121,055.14→120,555.14. Cashboxes unchanged. Track A: DS-009B was last freeze blocker — now ready for freeze pending EXC-1 documentation (non-blocking).*
*עודכן קודם: 16 יולי 2026 — PR-R4 CI PASS ✅ (PR #59, HEAD c24e9f61, 5 קבצים, FR-001 ✅). READY FOR PRODUCT REVIEW — ממתין לאישור יוסי למיזוג. Bridge v2: 4 תיקוני correctness (test_merge_sha, verify_file 400 fallback, verify_commit refs/heads/, rebase local_path) — מתועדים ב-BRIDGE_V2_RELEASE_NOTES.md.*
*עודכן קודם: 16 יולי 2026 — PR #55 E3-A1 MERGED (SHA 5a27e63b). DailyGreeting + AllClearCard על main. FR-001 ✅ FR-002 ✅. Bridge v2 Cleanup הושלם (action API unified, field validation, frozen interface). R4 prerequisites met — מוכן לפתיחה.*
*עודכן קודם: 16 יולי 2026 — FR-002 Never Assume Merge State (Section 13.10) + Design Audit Gate (Section 13.11) אושרו. push_r4.py: pre-flight check מאמת prerequisites על main לפני branching. הוראה 14 נוספה לסוכן.*
*עודכן קודם: 16 יולי 2026 — FR-001 Single Component Ownership אושר (Section 13.9). Component ownership table + הוראה 13 נוספו. push_r4.py נוקה: 5 קבצים בלבד (ללא AllClearCard), PR body 29 tests, תלות ב-PR #55 documented. סדר ביצוע נעול: merge PR #58 → PUSH_PR55_CLEANUP → merge PR #55 → PUSH_R4.*
*עודכן קודם: 16 יולי 2026 — PR-R2 Business Story + Property Health MERGED (PR #57, SHA f293cbc0). PropertyHealth + BusinessStory + deriveHealthStatus + DS barrel fix. 21 tests PASS. Branch deleted. הבא: R3 — Income + Expenses.*
*עודכן קודם: 16 יולי 2026 — PR-R1 Welcome + Executive Summary MERGED (PR #56, SHA 68a57a3f). WelcomeHeader + ExecutiveSummary + HealthSignal DS export. 18 tests PASS. Branch deleted. הבא: R2 — Business Story + Property Health.*
*עודכן קודם: 15 יולי 2026 — M9-C Partner Report Screen Foundation MERGED (PR #51, SHA 44b1eaff). 8-step auth chain, DTO v1.0 locked, 5 components, 28 tests PASS, CI PASS. Branch deleted. הבא: Partner Report QA + Visual Polish (PR D).*
*עודכן קודם: 13 יולי 2026 — ADR-001 Canonical Knowledge Authority אושר (מסמך חוקתי), JHKA architecture established, הוראה 12 נוספה לסוכנים*
*עודכן קודם: 12 יולי 2026 — M0 status: M0.1/M0.2 In Validation (עד 18/7), M0.4 preview auth hang תוקן ואומת E2E, אירועי webhook ראשונים התקבלו, PR #16 מוכן ל-QA+merge*
*עודכן קודם: 8 יולי 2026 — PREREQ-1 closeout: row count corrected (2,271→2,127), SA-019 documented, RC3.1 Data Quality Backlog added, session local_37036e34*  
*עודכן קודם: 6 יולי 2026 — Architecture Sync RC1/RC2 + Internal Offset business rule + Partner Capital Rule + **RC1 Business Freeze declared***
