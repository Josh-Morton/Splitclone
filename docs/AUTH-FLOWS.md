*(Part of the [Tally roadmap](ROADMAP.md). Scope for fixing what's shown here:
[BACKLOG → Sign-up, login & accounts rework](BACKLOG.md#sign-up-login--accounts--holistic-rework-audit-2026-10-28).)*

# Auth & account flows

Every way a person gets into Tally, as built on **2026-10-28**, followed by
how user records are stored and the proposed flows. Read against the code:
`src/app/welcome`, `verify`, `onboarding`, `join/[code]`, `src/lib/session.ts`,
`src/lib/routing.ts`, and the live Supabase auth configuration.

**Colour key:** 🟥 red = broken or a dead end today · 🟨 amber = works, but
confusing or fragile · 🟩 green = the happy path.

## Part 1 — How it works today

### 1. The map: every way in

```mermaid
flowchart TD
  open(["Open Tally"]) --> stored{"A session saved<br/>on this device?"}
  stored -- "yes" --> live{"Token valid, or<br/>refreshes OK?"}
  live -- "yes" --> route
  live -- "network blip" --> retry["Retry up to 4×<br/>(BUG-014 fix)"] --> route
  live -- "server rejects it" --> welcome
  stored -- "no" --> welcome["/welcome<br/>Log in · Sign up tabs"]

  welcome --> login["Log in<br/>(email + password)"]
  welcome --> signup["Sign up<br/>(email + password)"]
  welcome --> magic["Email me a<br/>sign-in link"]
  welcome --> forgot["Forgot password?"]
  welcome --> demo["Skip → demo Tally<br/>(nothing is saved)"]

  invite(["Invite link<br/>/join/CODE"]) --> join["/join<br/>Accept invite"]
  splitty(["Splitty link<br/>/split/CODE"]) --> guest["Guest types a name<br/>(no account at all)"]

  login --> route{"Where next?<br/>postAuthDestination"}
  signup --> route
  magic --> route
  route -- "no display name" --> onb["/onboarding<br/>name → salary → Tally"]
  route -- "invite waiting<br/>(same tab only)" --> join
  route -- "no Tally yet" --> onbS["/onboarding<br/>create or join a Tally"]
  route -- "all set" --> home(["Home"])

  classDef broken fill:#fde8e6,stroke:#c0392b,color:#5c1a12;
  classDef warn fill:#fff4d6,stroke:#b7791f,color:#5c3d0b;
  classDef ok fill:#e3f4ef,stroke:#1d6e6a,color:#0f3d3a;
  class magic,forgot broken;
  class signup,join warn;
  class login,home ok;
```

Two of the four buttons on the sign-in screen depend on email, and Tally can't
send email to its users (see 3 and 4).

### 2. Sign up

```mermaid
flowchart TD
  a["Welcome → Sign up tab"] --> b["Type email + password<br/>(6+ characters)"]
  b --> c{"Supabase signUp"}
  c -- "new email" --> d["Signed in instantly<br/>no email check at all"]
  c -- "email already<br/>has an account" --> e["Long notice: use a sign-in<br/>link or reset your password"]
  e --> f["Both of those need email<br/>→ dead end"]
  c -- "other error" --> g["Raw Supabase message"]
  d --> h["/onboarding step 1<br/>What's your name?"]
  h --> i["Step 2: monthly salary<br/>(optional — Skip)"]
  i --> j{"Invite code saved<br/>in this tab?"}
  j -- "yes" --> k["/join → Accept"]
  j -- "no" --> l["Step 3: Create a Tally<br/>or type an invite code"]
  k --> home(["Home"])
  l --> home

  d -.-> typo["A typo in the email is never caught:<br/>that account can't be recovered later"]

  classDef broken fill:#fde8e6,stroke:#c0392b,color:#5c1a12;
  classDef warn fill:#fff4d6,stroke:#b7791f,color:#5c3d0b;
  classDef ok fill:#e3f4ef,stroke:#1d6e6a,color:#0f3d3a;
  class f broken;
  class e,g,typo,i warn;
  class d,home ok;
```

### 3. Log in, and "Forgot password?"

```mermaid
flowchart TD
  a["Welcome → Log in tab"] --> b{"Supabase<br/>signInWithPassword"}
  b -- "correct" --> route{"postAuthDestination"} --> home(["Home"])
  b -- "wrong email or password" --> c["Wrong email or password. If you've<br/>only used a sign-in link, use one"]
  c --> magic["Email me a sign-in link"]

  f["Forgot password?"] --> g{"Is the address on<br/>the Supabase team?"}
  g -- "no (every real user<br/>except the owner)" --> h["Error: email address<br/>not authorized"]
  g -- "yes" --> rl{"Under 2 emails this hour,<br/>project-wide?"}
  rl -- "no" --> h2["Error: rate limit exceeded"]
  rl -- "yes" --> i["Reset email arrives"]
  i --> j["Link opens Tally<br/>already signed in"]
  j --> k["No 'choose a new password'<br/>screen exists"]
  k --> l["Password unchanged →<br/>next log-in fails again"]

  classDef broken fill:#fde8e6,stroke:#c0392b,color:#5c1a12;
  classDef warn fill:#fff4d6,stroke:#b7791f,color:#5c3d0b;
  classDef ok fill:#e3f4ef,stroke:#1d6e6a,color:#0f3d3a;
  class h,h2,k,l,magic broken;
  class c warn;
  class home ok;
```

### 4. "Email me a sign-in link"

```mermaid
flowchart TD
  a["Email me a sign-in link"] --> b{"Address on the<br/>Supabase team?"}
  b -- "no" --> x["Raw error: email address<br/>not authorized"]
  b -- "yes" --> c{"Under 2 emails/hour?"}
  c -- "no" --> y["Raw error: rate limit"]
  c -- "yes" --> d["/verify: Check your email"]
  d --> e["Leave Tally, open the mail app,<br/>tap the link"]
  e --> f["Link opens in the BROWSER,<br/>not the home-screen app"]
  f --> g{"Phone?"}
  g -- "Android" --> h["Shares storage with Chrome:<br/>the app tab signs in too"]
  g -- "iPhone home-screen app" --> i["Separate storage:<br/>the app stays signed out"]
  d --> code["'Got a 6-digit code?'"]
  code --> z["Email contains no code, and<br/>Supabase issues 8 digits anyway"]

  classDef broken fill:#fde8e6,stroke:#c0392b,color:#5c1a12;
  classDef warn fill:#fff4d6,stroke:#b7791f,color:#5c3d0b;
  classDef ok fill:#e3f4ef,stroke:#1d6e6a,color:#0f3d3a;
  class x,y,i,z broken;
  class e,f warn;
  class h ok;
```

### 5. Joining someone's Tally by invite

```mermaid
flowchart TD
  a["Owner: Manage Tally → Share invite"] --> b["Code created<br/>never expires · unlimited uses"]
  b --> c["Share message (WhatsApp etc.):<br/>link + steps + code"]
  c --> d["/join/CODE: 'Josh invited you'"]
  d --> e{"Signed in?"}
  e -- "yes" --> f["Accept & join"] --> home(["Home, in their Tally"])
  e -- "no" --> g["Sign in to accept"]
  g --> h["Code saved in sessionStorage<br/>(this browser tab only)"]
  h --> w["/welcome opens on Log in,<br/>no mention of the invite"]
  w --> s["New person must find Sign up"]
  s --> n["Name → salary"]
  n --> t{"Still the same tab?"}
  t -- "yes" --> f
  t -- "no: new tab, email link,<br/>app restarted" --> lost["'Create your Tally'<br/>→ they make an empty one of their own"]

  classDef broken fill:#fde8e6,stroke:#c0392b,color:#5c1a12;
  classDef warn fill:#fff4d6,stroke:#b7791f,color:#5c3d0b;
  classDef ok fill:#e3f4ef,stroke:#1d6e6a,color:#0f3d3a;
  class lost broken;
  class b,h,w,s,n warn;
  class f,home ok;
```

### 6. Opening the app, and signing out

```mermaid
flowchart TD
  a(["App opens or resumes"]) --> b{"Session stored<br/>in this browser?"}
  b -- "no" --> w["/welcome"]
  b -- "yes" --> c{"Access token<br/>expires in > 1 min?"}
  c -- "yes" --> home(["Home"])
  c -- "no" --> d["Refresh token<br/>(single-flight)"]
  d -- "OK" --> home
  d -- "offline / 5xx /<br/>rotation race" --> e["Keep the session,<br/>retry with backoff"] --> home
  d -- "400/401: really over" --> w
  so["Settings → Sign out"] --> l["signOut(scope: local)<br/>this device only"] --> w

  classDef ok fill:#e3f4ef,stroke:#1d6e6a,color:#0f3d3a;
  class home,l ok;
```

This part is solid since BUG-005, BUG-007 and BUG-014. Sessions last until a
refresh token is rejected; there's no idle timeout.

### 7. Splitty guests (no account)

```mermaid
flowchart LR
  a(["/split/CODE link"]) --> b{"Guest token for this bill<br/>in localStorage?"}
  b -- "yes" --> c["Resume as that guest"]
  b -- "no" --> d["Type a display name"] --> e["splitty_join RPC<br/>returns a guest token"] --> c
  c --> f["Claim items, tip, lock<br/>(token checked server-side)"]
```

Separate by design (ADR-0013) and not part of the rework.

## Part 2 — How user records are stored

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILE : "created by trigger on sign-up"
  AUTH_USERS ||--o{ AUTH_IDENTITIES : "sign-in methods (email only today)"
  AUTH_USERS ||--o{ AUTH_SESSIONS : "one per signed-in device"
  AUTH_USERS ||--o{ GROUP_MEMBER : "user_id (null = placeholder)"
  GROUP ||--o{ GROUP_MEMBER : "members"
  GROUP ||--o{ INVITE : "invite codes"
  INVITE }o--o| GROUP_MEMBER : "may upgrade a placeholder"
  PROFILE }o--o| GROUP : "default_group_id"

  AUTH_USERS {
    uuid id PK
    text email "the only copy of the email"
    text encrypted_password "set for all 9 accounts"
    timestamptz email_confirmed_at "auto-set: confirmation is off"
    timestamptz last_sign_in_at
  }
  PROFILE {
    uuid user_id PK
    text display_name "empty = never finished onboarding"
    text avatar_url
    bigint monthly_salary_cents "private by RLS"
    bool salary_visible
    uuid default_group_id
  }
  GROUP_MEMBER {
    uuid id PK
    uuid group_id FK
    uuid user_id FK
    text placeholder_name
    enum role "owner or member"
    enum status "active, left (invited unused)"
  }
  INVITE {
    uuid id PK
    text code "e.g. KWM-4T2Q"
    timestamptz expires_at "never set"
    uuid upgrades_member_id
  }
```

- **One identity per email.** `auth.users` is keyed on the email, so a
  password and a sign-in link on the same address are the same account. A
  second address is a second, unconnected account; there's no merge.
- **Email lives only in `auth.users`.** Co-members never see it, and nothing
  in the app shows you which address you're signed in with.
- **"Onboarded" is inferred** from a non-empty `display_name`. There's no
  explicit flag.
- **Live records (2026-10-28):** 9 accounts, all email + password. **4 are
  real people; 5 are leftover test accounts** from a 23 July verification
  run. Those 5 have no name, no expenses, and own 2 solo Tallies and 2
  invites. 6 invite codes exist; none expires.

## Part 3 — Proposed flows (after the rework)

### A. Getting in: one screen, one obvious path

```mermaid
flowchart TD
  a(["Open Tally"]) --> b["Sign-in screen"]
  b --> g["Continue with Google<br/>(optional, decision D3)"]
  b --> e["Enter your email → Continue"]
  e --> c["We email a 6-digit code<br/>(works inside the home-screen app)"]
  c --> v{"Code correct?"}
  v -- "yes, new person" --> n["What's your name?<br/>(one screen)"]
  v -- "yes, returning" --> home(["Home"])
  v -- "wrong / expired" --> r["Plain message +<br/>Resend in 60s"] --> c
  e --> p["Use a password instead<br/>(for people who set one)"] --> home
  g --> home
  n --> t{"Joining by invite?"}
  t -- "yes" --> j["Joined that Tally"] --> home
  t -- "no" --> k["Name your Tally"] --> home

  classDef ok fill:#e3f4ef,stroke:#1d6e6a,color:#0f3d3a;
  class home,j ok;
```

The same code flow covers sign-up, log-in, a new phone and a forgotten
password, so there's nothing separate to recover.

### B. Joining by invite

```mermaid
flowchart TD
  a(["Invite link /join/CODE"]) --> b["'Josh invited you to Our Flat'<br/>→ Join"]
  b --> c{"Signed in?"}
  c -- "yes" --> j["Joined"] --> home(["Home, in Our Flat"])
  c -- "no" --> d["Sign-in screen with banner:<br/>'Joining Our Flat'"]
  d --> e["Code kept in localStorage + the URL:<br/>survives new tabs, email links, restarts"]
  e --> f["Email → code → name"] --> j

  classDef ok fill:#e3f4ef,stroke:#1d6e6a,color:#0f3d3a;
  class j,home ok;
```

Invites expire after a set time and can be revoked. Salary is asked later, in
context (the first time someone picks a proportional split), not during
sign-up.

### C. Your account, in Settings

```mermaid
flowchart LR
  s["Settings → Account"] --> e1["Signed in as you@…"]
  s --> pw["Set or change password"]
  s --> em["Change email<br/>(code to the new address)"]
  s --> out["Sign out: this device<br/>or every device"]
  s --> del["Delete account<br/>(confirm with a code)"]
  del --> keep["Leaves every Tally; shared history<br/>stays, shown as 'Former member'"]
```
